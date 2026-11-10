/**
 * DoseWise backend, AWS af-south-1 (Cape Town) for South African data residency (POPIA).
 *
 *   App ──JWT──▶ HTTP API ─▶ api Lambda ─┐
 *   Meta ─signed─▶ /whatsapp/webhook ─────┤──▶ Aurora PostgreSQL (private, KMS-encrypted)
 *   SMS replies ─▶ SNS topic ─▶ sms Lambda┤
 *   Scheduler: sweep (5 min), summaries (15 min), retention (daily)
 *
 * Personal fields are additionally encrypted per field (KMS envelope) and looked up via a
 * KMS HMAC key, so database snapshots and logs never contain names or numbers in clear.
 */
import * as path from "node:path";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  CfnOutput,
  CustomResource,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
  TimeZone,
  aws_apigatewayv2 as apigw,
  aws_apigatewayv2_authorizers as authorizers,
  aws_apigatewayv2_integrations as integrations,
  aws_cloudwatch as cloudwatch,
  aws_cognito as cognito,
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_kms as kms,
  aws_lambda as lambda,
  aws_lambda_event_sources as sources,
  aws_lambda_nodejs as nodejs,
  aws_logs as logs,
  aws_rds as rds,
  aws_scheduler as scheduler,
  aws_scheduler_targets as targets,
  aws_secretsmanager as secrets,
  aws_sns as sns,
  custom_resources as cr,
} from "aws-cdk-lib";
import type { Construct } from "constructs";

const ROOT = path.join(__dirname, "../..");
const HANDLERS = path.join(ROOT, "services/api/src/handlers");

export interface DoseWiseStackProps extends StackProps {
  /** WhatsApp Business phone number id from Meta (not secret). */
  whatsappPhoneNumberId: string;
  /** Alphanumeric SMS sender id, once registered for South Africa. */
  smsSenderId?: string;
  /** "prod" keeps data on stack deletion; anything else is disposable. */
  stage: "prod" | "staging";
}

export class DoseWiseStack extends Stack {
  constructor(scope: Construct, id: string, props: DoseWiseStackProps) {
    super(scope, id, props);
    const prod = props.stage === "prod";
    const keep = prod ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;

    /* ---------- keys ---------- */
    const storageKey = new kms.Key(this, "StorageKey", {
      description: "DoseWise: database, secrets and topics at rest",
      enableKeyRotation: true,
      removalPolicy: keep,
    });
    const fieldKey = new kms.Key(this, "FieldKey", {
      description: "DoseWise: per-field envelope encryption of personal data",
      enableKeyRotation: true,
      removalPolicy: keep,
    });
    const indexKey = new kms.Key(this, "IndexKey", {
      description: "DoseWise: HMAC blind index for phone-number lookups",
      keySpec: kms.KeySpec.HMAC_256,
      keyUsage: kms.KeyUsage.GENERATE_VERIFY_MAC,
      removalPolicy: keep,
    });

    /* ---------- network ---------- */
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 1, // Lambdas reach Meta's API through it
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC },
        { name: "app", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
        { name: "data", subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
    });
    // AWS service calls stay inside the VPC.
    vpc.addInterfaceEndpoint("SecretsEndpoint", { service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER });
    vpc.addInterfaceEndpoint("KmsEndpoint", { service: ec2.InterfaceVpcEndpointAwsService.KMS });
    vpc.addInterfaceEndpoint("SnsEndpoint", { service: ec2.InterfaceVpcEndpointAwsService.SNS });
    const lambdaSg = new ec2.SecurityGroup(this, "LambdaSg", { vpc, description: "DoseWise functions" });
    const dbSg = new ec2.SecurityGroup(this, "DbSg", { vpc, description: "DoseWise database", allowAllOutbound: false });
    dbSg.addIngressRule(lambdaSg, ec2.Port.tcp(5432), "Functions only");

    /* ---------- database ---------- */
    const db = new rds.DatabaseCluster(this, "Db", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({ version: rds.AuroraPostgresEngineVersion.VER_17_7 }),
      credentials: rds.Credentials.fromGeneratedSecret("dosewise_app", { encryptionKey: storageKey }),
      defaultDatabaseName: "dosewise",
      writer: rds.ClusterInstance.serverlessV2("writer"),
      readers: prod ? [rds.ClusterInstance.serverlessV2("reader", { scaleWithWriter: true })] : [],
      serverlessV2MinCapacity: prod ? 0.5 : 0,
      serverlessV2MaxCapacity: 4,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      storageEncrypted: true,
      storageEncryptionKey: storageKey,
      backup: { retention: Duration.days(prod ? 14 : 1) },
      deletionProtection: prod,
      removalPolicy: prod ? RemovalPolicy.SNAPSHOT : RemovalPolicy.DESTROY,
      cloudwatchLogsExports: ["postgresql"],
      cloudwatchLogsRetention: logs.RetentionDays.THREE_MONTHS,
      parameters: { "rds.force_ssl": "1", log_statement: "none" }, // TLS only; never log SQL with parameters
    });

    /* ---------- secrets ---------- */
    // Fill accessToken and appSecret from Meta after deploy; verifyToken is generated here.
    const whatsappSecret = new secrets.Secret(this, "WhatsAppSecret", {
      description: "DoseWise: WhatsApp Cloud API token, app secret and webhook verify token",
      encryptionKey: storageKey,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ accessToken: "SET_ME", appSecret: "SET_ME" }),
        generateStringKey: "verifyToken",
        excludePunctuation: true,
        passwordLength: 40,
      },
      removalPolicy: keep,
    });

    /* ---------- sign-in: SMS one-time code, no passwords shown to people ---------- */
    const users = new cognito.UserPool(this, "Users", {
      userPoolName: `dosewise-${props.stage}`,
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      selfSignUpEnabled: true,
      signInAliases: { phone: true },
      autoVerify: { phone: true },
      standardAttributes: { phoneNumber: { required: true, mutable: false } },
      // Cognito requires the password factor to exist; the app sets a random one and never shows it.
      signInPolicy: { allowedFirstAuthFactors: { password: true, smsOtp: true } },
      passwordPolicy: { minLength: 16 },
      accountRecovery: cognito.AccountRecovery.PHONE_ONLY_WITHOUT_MFA,
      deletionProtection: prod,
      removalPolicy: keep,
    });
    const appClient = users.addClient("App", {
      authFlows: { user: true },
      generateSecret: false,
      preventUserExistenceErrors: true,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(60),
    });

    /* ---------- functions ---------- */
    const common: nodejs.NodejsFunctionProps = {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(20),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSg],
      projectRoot: ROOT,
      depsLockFilePath: path.join(ROOT, "package-lock.json"),
      bundling: {
        minify: true,
        sourceMap: true,
        format: nodejs.OutputFormat.ESM,
        loader: { ".sql": "text" },
        mainFields: ["module", "main"],
        // pg is CommonJS and requires Node built-ins; ESM bundles have no `require` without this.
        banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
      environment: {
        NODE_OPTIONS: "--enable-source-maps",
        DB_SECRET_ARN: db.secret!.secretArn,
        FIELD_KEY_ID: fieldKey.keyArn,
        INDEX_KEY_ID: indexKey.keyArn,
        WHATSAPP_SECRET_ARN: whatsappSecret.secretArn,
        WHATSAPP_PHONE_NUMBER_ID: props.whatsappPhoneNumberId,
        ...(props.smsSenderId ? { SMS_SENDER_ID: props.smsSenderId } : {}),
      },
    };
    const fn = (name: string, file: string, handler = "handler", extra: Partial<nodejs.NodejsFunctionProps> = {}) => {
      const f = new nodejs.NodejsFunction(this, name, {
        ...common,
        ...extra,
        entry: path.join(HANDLERS, file),
        handler,
        logGroup: new logs.LogGroup(this, `${name}Logs`, { retention: logs.RetentionDays.THREE_MONTHS, removalPolicy: RemovalPolicy.DESTROY }),
      });
      db.secret!.grantRead(f);
      whatsappSecret.grantRead(f);
      fieldKey.grant(f, "kms:GenerateDataKey", "kms:Decrypt", "kms:Encrypt");
      indexKey.grant(f, "kms:GenerateMac");
      // SMS to phone numbers has no resource ARN, so this can't be narrowed further.
      f.addToRolePolicy(new iam.PolicyStatement({ actions: ["sns:Publish"], resources: ["*"] }));
      return f;
    };

    const api = fn("Api", "http.ts");
    const webhook = fn("Webhook", "webhook.ts");
    const smsInbound = fn("SmsInbound", "smsInbound.ts");
    const sweep = fn("Sweep", "jobs.ts", "sweep", { timeout: Duration.minutes(4) });
    const summaries = fn("Summaries", "jobs.ts", "summaries", { timeout: Duration.minutes(10) });
    const retention = fn("Retention", "jobs.ts", "retention", { timeout: Duration.minutes(10) });
    const migrate = fn("Migrate", "migrate.ts", "handler", { timeout: Duration.minutes(2) });

    /* ---------- HTTP API ---------- */
    const http = new apigw.HttpApi(this, "HttpApi", { apiName: `dosewise-${props.stage}`, createDefaultStage: false });
    new apigw.HttpStage(this, "Stage", {
      httpApi: http,
      stageName: "$default",
      autoDeploy: true,
      throttle: { rateLimit: 50, burstLimit: 100 },
    });
    const jwt = new authorizers.HttpJwtAuthorizer("Cognito", `https://cognito-idp.${this.region}.amazonaws.com/${users.userPoolId}`, {
      jwtAudience: [appClient.userPoolClientId],
    });
    const apiIntegration = new integrations.HttpLambdaIntegration("ApiIntegration", api);
    const routes: [apigw.HttpMethod, string][] = [
      [apigw.HttpMethod.GET, "/v1/me"],
      [apigw.HttpMethod.PUT, "/v1/me"],
      [apigw.HttpMethod.DELETE, "/v1/me"],
      [apigw.HttpMethod.GET, "/v1/me/export"],
      [apigw.HttpMethod.GET, "/v1/caregivers"],
      [apigw.HttpMethod.POST, "/v1/caregivers"],
      [apigw.HttpMethod.DELETE, "/v1/caregivers/{id}"],
      [apigw.HttpMethod.PUT, "/v1/slots"],
    ];
    for (const [method, routePath] of routes) http.addRoutes({ path: routePath, methods: [method], integration: apiIntegration, authorizer: jwt });
    // Meta can't send a JWT; this route is protected by the request signature instead.
    http.addRoutes({
      path: "/whatsapp/webhook",
      methods: [apigw.HttpMethod.GET, apigw.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("WebhookIntegration", webhook),
    });

    /* ---------- inbound SMS (two-way number provisioned in AWS End User Messaging) ---------- */
    const smsTopic = new sns.Topic(this, "SmsReplies", { displayName: "DoseWise SMS replies", masterKey: storageKey });
    smsInbound.addEventSource(new sources.SnsEventSource(smsTopic));

    /* ---------- schedules ---------- */
    const every = (name: string, f: lambda.IFunction, expression: scheduler.ScheduleExpression) =>
      new scheduler.Schedule(this, name, { schedule: expression, target: new targets.LambdaInvoke(f, { retryAttempts: 0 }) });
    every("SweepEvery5Min", sweep, scheduler.ScheduleExpression.rate(Duration.minutes(5)));
    every("SummariesEvery15Min", summaries, scheduler.ScheduleExpression.rate(Duration.minutes(15)));
    every("RetentionDaily", retention, scheduler.ScheduleExpression.cron({ hour: "2", minute: "17", timeZone: TimeZone.AFRICA_JOHANNESBURG }));

    /* ---------- schema migration on every deploy where the SQL changed ---------- */
    const sqlHash = createHash("sha256")
      .update(readFileSync(path.join(ROOT, "services/api/src/db/schema.sql")))
      .update(readFileSync(path.join(ROOT, "services/api/src/db/guards.sql")))
      .digest("hex");
    const migrations = new CustomResource(this, "Migrations", {
      serviceToken: new cr.Provider(this, "MigrationsProvider", { onEventHandler: migrate }).serviceToken,
      properties: { sqlHash },
    });
    migrations.node.addDependency(db);

    /* ---------- alarms: a silent sweep means families aren't being told ---------- */
    for (const [name, f] of [["Sweep", sweep], ["Webhook", webhook], ["Api", api]] as const) {
      new cloudwatch.Alarm(this, `${name}Errors`, {
        metric: f.metricErrors({ period: Duration.minutes(5) }),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: `DoseWise ${name} function errors`,
      });
    }

    new CfnOutput(this, "ApiUrl", { value: http.apiEndpoint });
    new CfnOutput(this, "WebhookUrl", { value: `${http.apiEndpoint}/whatsapp/webhook` });
    new CfnOutput(this, "UserPoolId", { value: users.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: appClient.userPoolClientId });
    new CfnOutput(this, "WhatsAppSecretArn", { value: whatsappSecret.secretArn });
    new CfnOutput(this, "SmsRepliesTopicArn", { value: smsTopic.topicArn });
  }
}

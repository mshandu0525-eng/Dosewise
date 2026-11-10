import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { DoseWiseStack } from "../lib/dosewise-stack";

let t: Template;

beforeAll(() => {
  // Skip Lambda bundling here; `npm run synth` bundles for real.
  const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
  const stack = new DoseWiseStack(app, "Test", { stage: "prod", env: { account: "111111111111", region: "af-south-1" }, whatsappPhoneNumberId: "123" });
  t = Template.fromStack(stack);
});

describe("data residency and encryption", () => {
  it("deploys to Cape Town", () => {
    const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
    const stack = new DoseWiseStack(app, "Region", { stage: "staging", env: { region: "af-south-1" }, whatsappPhoneNumberId: "1" });
    expect(stack.region).toBe("af-south-1");
    expect(JSON.stringify(t.toJSON())).toContain("cognito-idp.af-south-1.amazonaws.com");
  });

  it("encrypts the database with a customer-managed key, keeps it private and protected", () => {
    t.hasResourceProperties("AWS::RDS::DBCluster", {
      StorageEncrypted: true,
      KmsKeyId: Match.anyValue(),
      DeletionProtection: true,
      EnableCloudwatchLogsExports: ["postgresql"],
    });
    t.hasResourceProperties("AWS::RDS::DBInstance", { PubliclyAccessible: false });
    t.hasResourceProperties("AWS::RDS::DBClusterParameterGroup", { Parameters: { "rds.force_ssl": "1", log_statement: "none" } });
  });

  it("rotates symmetric keys and has an HMAC key for lookups", () => {
    const keys = t.findResources("AWS::KMS::Key");
    const specs = Object.values(keys).map((k) => (k as { Properties: Record<string, unknown> }).Properties);
    expect(specs.filter((p) => p.KeySpec === "HMAC_256" && p.KeyUsage === "GENERATE_VERIFY_MAC")).toHaveLength(1);
    expect(specs.filter((p) => p.EnableKeyRotation === true)).toHaveLength(2);
  });

  it("encrypts the WhatsApp secret and the SMS reply topic", () => {
    t.hasResourceProperties("AWS::SecretsManager::Secret", { KmsKeyId: Match.anyValue(), Description: Match.stringLikeRegexp("WhatsApp") });
    t.hasResourceProperties("AWS::SNS::Topic", { KmsMasterKeyId: Match.anyValue() });
  });
});

describe("access", () => {
  it("only lets the functions reach the database port", () => {
    t.hasResourceProperties("AWS::EC2::SecurityGroupIngress", { FromPort: 5432, ToPort: 5432, SourceSecurityGroupId: Match.anyValue() });
    const ingress = t.findResources("AWS::EC2::SecurityGroup");
    for (const sg of Object.values(ingress)) {
      const rules = ((sg as { Properties: { SecurityGroupIngress?: { CidrIp?: string }[] } }).Properties.SecurityGroupIngress ?? []);
      expect(rules.some((r) => r.CidrIp === "0.0.0.0/0")).toBe(false);
    }
  });

  it("protects every app route with the Cognito JWT authoriser; only the signed webhook is open", () => {
    const routes = Object.values(t.findResources("AWS::ApiGatewayV2::Route")).map(
      (r) => (r as { Properties: { RouteKey: string; AuthorizationType?: string } }).Properties,
    );
    const open = routes.filter((r) => r.AuthorizationType !== "JWT").map((r) => r.RouteKey).sort();
    expect(open).toEqual(["GET /whatsapp/webhook", "POST /whatsapp/webhook"]);
    expect(routes.filter((r) => r.AuthorizationType === "JWT")).toHaveLength(8);
  });

  it("signs people in with SMS codes on the Essentials plan", () => {
    t.hasResourceProperties("AWS::Cognito::UserPool", {
      UserPoolTier: "ESSENTIALS",
      Policies: Match.objectLike({ SignInPolicy: { AllowedFirstAuthFactors: Match.arrayWith(["SMS_OTP"]) } }),
      DeletionProtection: "ACTIVE",
    });
    t.hasResourceProperties("AWS::Cognito::UserPoolClient", { ExplicitAuthFlows: Match.arrayWith(["ALLOW_USER_AUTH"]), GenerateSecret: false });
  });

  it("runs every function inside the VPC on Node 22 with 90-day logs", () => {
    const fns = Object.values(t.findResources("AWS::Lambda::Function")).map((f) => (f as { Properties: Record<string, any> }).Properties);
    const ours = fns.filter((f) => f.Environment?.Variables?.DB_SECRET_ARN);
    expect(ours).toHaveLength(7);
    for (const f of ours) {
      expect(f.Runtime).toBe("nodejs22.x");
      expect(f.VpcConfig).toBeDefined();
    }
    t.allResourcesProperties("AWS::Logs::LogGroup", { RetentionInDays: 90 });
  });
});

describe("jobs", () => {
  it("sweeps every 5 minutes, sends summaries every 15, and applies retention daily in SAST", () => {
    t.hasResourceProperties("AWS::Scheduler::Schedule", { ScheduleExpression: "rate(5 minutes)" });
    t.hasResourceProperties("AWS::Scheduler::Schedule", { ScheduleExpression: "rate(15 minutes)" });
    t.hasResourceProperties("AWS::Scheduler::Schedule", { ScheduleExpressionTimezone: "Africa/Johannesburg" });
  });

  it("alarms when the sweep, webhook or API fail", () => {
    t.resourceCountIs("AWS::CloudWatch::Alarm", 3);
  });
});

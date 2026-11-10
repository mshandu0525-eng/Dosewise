/**
 * Production wiring: builds the dependencies once per Lambda container from
 * environment variables set by the CDK stack. Secrets come from Secrets Manager.
 */
import { randomUUID } from "node:crypto";
import { KMSClient } from "@aws-sdk/client-kms";
import { RDSDataClient } from "@aws-sdk/client-rds-data";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { SNSClient } from "@aws-sdk/client-sns";
import pg from "pg";
import { KmsFieldCipher } from "../lib/cipher";
import { DataApiDb } from "../lib/dataApiDb";
import { DEFAULT_CONFIG, type Db, type Deps } from "../domain/deps";
import { SnsSmsSender, WhatsAppCloudMessenger } from "../whatsapp/messenger";
import { OutboxMessenger, OutboxSms } from "../whatsapp/outbox";

const env = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
};

const secrets = new SecretsManagerClient({});
const secretCache = new Map<string, Promise<Record<string, string>>>();
export function secret(arn: string): Promise<Record<string, string>> {
  let v = secretCache.get(arn);
  if (!v) {
    v = secrets.send(new GetSecretValueCommand({ SecretId: arn })).then((r) => JSON.parse(r.SecretString ?? "{}"));
    secretCache.set(arn, v);
  }
  return v;
}

let pool: pg.Pool | undefined;
let dataApi: DataApiDb | undefined;

/** "lite" staging: the Data API over HTTPS (no VPC). Otherwise a pg connection inside the VPC. */
export const usesDataApi = () => process.env.DB_MODE === "data-api";

async function db(): Promise<Db> {
  if (usesDataApi()) {
    dataApi ??= new DataApiDb(new RDSDataClient({}), {
      resourceArn: env("DB_CLUSTER_ARN"),
      secretArn: env("DB_SECRET_ARN"),
      database: process.env.DB_NAME ?? "dosewise",
    });
    return dataApi;
  }
  if (!pool) {
    const s = await secret(env("DB_SECRET_ARN"));
    pool = new pg.Pool({
      host: s.host,
      port: Number(s.port ?? 5432),
      user: s.username,
      password: s.password,
      database: s.dbname ?? "dosewise",
      ssl: { rejectUnauthorized: true },
      max: 2,
      idleTimeoutMillis: 60_000,
    });
  }
  return pool as unknown as Db;
}

let deps: Promise<Deps> | undefined;
export function getDeps(): Promise<Deps> {
  deps ??= (async () => {
    const testMessaging = process.env.MESSAGING_MODE === "test";
    const database = await db();
    const cipher = new KmsFieldCipher(new KMSClient({}), env("FIELD_KEY_ID"), env("INDEX_KEY_ID"));
    const newId = () => randomUUID();
    const whatsappSecretArn = env("WHATSAPP_SECRET_ARN");
    return {
      db: database,
      cipher,
      // Test mode writes messages to the test outbox; live mode sends through Meta and SNS.
      whatsapp: testMessaging
        ? new OutboxMessenger(database, cipher, newId)
        : new WhatsAppCloudMessenger({
            phoneNumberId: env("WHATSAPP_PHONE_NUMBER_ID"),
            graphVersion: process.env.WHATSAPP_GRAPH_VERSION,
            token: async () => (await secret(whatsappSecretArn)).accessToken ?? "",
          }),
      sms: testMessaging ? new OutboxSms(database, cipher, newId) : new SnsSmsSender(new SNSClient({}), process.env.SMS_SENDER_ID),
      now: () => new Date(),
      newId,
      config: { ...DEFAULT_CONFIG, testMessaging },
    };
  })();
  return deps;
}

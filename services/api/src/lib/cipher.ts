/**
 * Field-level encryption for personal data in the database (names, phone numbers,
 * medicine names), on top of Aurora's own KMS encryption at rest.
 *
 * - Envelope encryption: each Lambda container asks KMS once for a data key, encrypts
 *   fields locally with AES-256-GCM, and stores the KMS-wrapped data key with each value.
 *   The plaintext key exists only in memory.
 * - Blind index: a KMS HMAC (the key never leaves KMS) of a normalised phone number,
 *   so an incoming WhatsApp reply can be matched to a caregiver without decrypting every row.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { DecryptCommand, GenerateDataKeyCommand, GenerateMacCommand, KMSClient } from "@aws-sdk/client-kms";

export interface FieldCipher {
  encrypt(plain: string): Promise<string>;
  decrypt(stored: string): Promise<string>;
  /** Deterministic, keyed lookup value for a phone number (already normalised to E.164). */
  index(phone: string): Promise<string>;
}

const VERSION = "v1";

function seal(key: Buffer, wrappedKey: string, plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [VERSION, wrappedKey, iv.toString("base64"), ct.toString("base64"), c.getAuthTag().toString("base64")].join(".");
}

function open(key: Buffer, parts: string[]) {
  const [, , iv, ct, tag] = parts;
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv!, "base64"));
  d.setAuthTag(Buffer.from(tag!, "base64"));
  return Buffer.concat([d.update(Buffer.from(ct!, "base64")), d.final()]).toString("utf8");
}

function split(stored: string) {
  const parts = stored.split(".");
  if (parts[0] !== VERSION || parts.length !== 5) throw new Error("Unrecognised ciphertext");
  return parts;
}

export class KmsFieldCipher implements FieldCipher {
  private dataKey?: Promise<{ plain: Buffer; wrapped: string }>;
  private unwrapped = new Map<string, Promise<Buffer>>();
  private indexes = new Map<string, Promise<string>>();

  constructor(
    private kms: KMSClient,
    private encryptionKeyId: string,
    private hmacKeyId: string,
  ) {}

  private currentKey() {
    this.dataKey ??= this.kms.send(new GenerateDataKeyCommand({ KeyId: this.encryptionKeyId, KeySpec: "AES_256" })).then((r) => ({
      plain: Buffer.from(r.Plaintext!),
      wrapped: Buffer.from(r.CiphertextBlob!).toString("base64"),
    }));
    return this.dataKey;
  }

  async encrypt(plain: string) {
    const k = await this.currentKey();
    return seal(k.plain, k.wrapped, plain);
  }

  async decrypt(stored: string) {
    const parts = split(stored);
    const wrapped = parts[1]!;
    let key = this.unwrapped.get(wrapped);
    if (!key) {
      key = this.kms
        .send(new DecryptCommand({ CiphertextBlob: Buffer.from(wrapped, "base64"), KeyId: this.encryptionKeyId }))
        .then((r) => Buffer.from(r.Plaintext!));
      this.unwrapped.set(wrapped, key);
    }
    return open(await key, parts);
  }

  async index(phone: string) {
    let v = this.indexes.get(phone);
    if (!v) {
      v = this.kms
        .send(new GenerateMacCommand({ KeyId: this.hmacKeyId, MacAlgorithm: "HMAC_SHA_256", Message: Buffer.from(phone, "utf8") }))
        .then((r) => Buffer.from(r.Mac!).toString("base64url"));
      this.indexes.set(phone, v);
    }
    return v;
  }
}

/** Local keys, for tests and local development only. */
export class LocalFieldCipher implements FieldCipher {
  private key: Buffer;
  private macKey: Buffer;
  constructor(seed = "dosewise-local-dev") {
    this.key = createHmac("sha256", seed).update("enc").digest();
    this.macKey = createHmac("sha256", seed).update("mac").digest();
  }
  async encrypt(plain: string) {
    return seal(this.key, "local", plain);
  }
  async decrypt(stored: string) {
    return open(this.key, split(stored));
  }
  async index(phone: string) {
    return createHmac("sha256", this.macKey).update(phone).digest("base64url");
  }
}

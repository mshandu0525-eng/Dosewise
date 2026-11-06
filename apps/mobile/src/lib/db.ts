/**
 * Encrypted on-device database (SQLCipher, AES-256).
 *
 * The 256-bit key is random per install and lives only in the iOS Keychain /
 * Android Keystore. It is marked "this device only", so it is never copied
 * into backups or to a new phone, and "after first unlock", so the Android
 * background task can log a dose from a notification while the phone is locked.
 */
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";

const KEY_NAME = "dosewise.db.key.v1";
const DB_NAME = "dosewise.db";
const keyOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

function databaseKey(): string {
  let key = SecureStore.getItem(KEY_NAME, keyOptions);
  if (!key) {
    key = Array.from(Crypto.getRandomBytes(32), (b) => b.toString(16).padStart(2, "0")).join("");
    SecureStore.setItem(KEY_NAME, key, keyOptions);
  }
  return key;
}

const MIGRATIONS: string[] = [
  `CREATE TABLE meds (id TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL, created_at INTEGER NOT NULL);
   CREATE TABLE logs (dose_key TEXT PRIMARY KEY NOT NULL, status TEXT NOT NULL, at INTEGER NOT NULL);
   CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`,
  // Phase 2: photo verification. Reference photos are stored inside the encrypted
  // database (small JPEG thumbnails), never as loose files.
  `CREATE TABLE refs (med_id TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL, updated_at INTEGER NOT NULL);
   ALTER TABLE logs ADD COLUMN check_json TEXT;
   CREATE TABLE eval_cases (id TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL, created_at INTEGER NOT NULL);`,
];

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (db) return db;
  const opened = SQLite.openDatabaseSync(DB_NAME);
  // Raw-key form: SQLCipher uses the 32 bytes directly, no passphrase derivation.
  opened.execSync(`PRAGMA key = "x'${databaseKey()}'"`);
  opened.execSync("PRAGMA journal_mode = WAL");
  const row = opened.getFirstSync<{ user_version: number }>("PRAGMA user_version");
  const version = row?.user_version ?? 0;
  for (let v = version; v < MIGRATIONS.length; v++) {
    opened.withTransactionSync(() => {
      opened.execSync(MIGRATIONS[v]!);
      opened.execSync(`PRAGMA user_version = ${v + 1}`);
    });
  }
  db = opened;
  return db;
}

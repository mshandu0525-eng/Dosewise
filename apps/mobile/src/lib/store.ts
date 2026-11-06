/**
 * App state: medicines, dose logs, photo-check references and settings, held
 * in memory and written through to the encrypted database on every change.
 * The rules themselves live in @dosewise/core; this file only stores and notifies.
 */
import type { DoseLog, EvalCase, Medication, Reference, State } from "@dosewise/core";
import * as Crypto from "expo-crypto";
import { useSyncExternalStore } from "react";
import { getDb } from "./db";
import { TESTER_BUILD } from "./tester";

export interface Settings {
  /** Larger text and targets, fewer tabs, spoken confirmations. */
  easyView: boolean;
  /** Show "2 medicines" instead of names on the lock screen. */
  hideNames: boolean;
  /** Read confirmations aloud after logging. */
  speak: boolean;
  /** Identifier of the last notification response handled, so it is not logged twice. */
  lastResponse: string;
  /** Tester mode: keep the text read from each photo check (never the photo) to measure accuracy. */
  collectTestCases: boolean;
  /** At least one family member is set up, so dose times are uploaded. */
  familySharing: boolean;
  /** Patient agreed to medicine names in family messages. */
  familyMedicineNames: boolean;
  /** Last time the patient looked at who gets their updates (reminded every 90 days). */
  familyReviewedAt: number;
  /** Version of the welcome notice the person accepted; empty = show the welcome screen. */
  acceptedLegalVersion: string;
  /** Guided reminder-check steps the person confirmed (can't be read from the phone). */
  batteryChecked: boolean;
  focusChecked: boolean;
  /** Send anonymous crash reports. On by default only in beta builds (beta consent covers it). */
  crashReports: boolean;
}

/** What was captured at setup for a medicine's photo check. */
export interface StoredReference extends Reference {
  /** OCR lines read from the box at setup. */
  labelText?: string[];
  /** Small JPEG thumbnails (base64), kept only inside the encrypted database. */
  boxPhoto?: string;
  pillPhoto?: string;
  updatedAt: number;
}

const defaults: Settings = {
  easyView: false,
  hideNames: false,
  speak: true,
  lastResponse: "",
  collectTestCases: false,
  familySharing: false,
  familyMedicineNames: false,
  familyReviewedAt: 0,
  acceptedLegalVersion: "",
  batteryChecked: false,
  focusChecked: false,
  crashReports: TESTER_BUILD,
};

let state: State = { meds: [], logs: {} };
let refs: Record<string, StoredReference> = {};
let settings: Settings = defaults;
let loaded = false;
const listeners = new Set<() => void>();
const changeHooks = new Set<() => void>();

function load() {
  if (loaded) return;
  const db = getDb();
  const meds = db
    .getAllSync<{ json: string }>("SELECT json FROM meds ORDER BY created_at")
    .map((r) => JSON.parse(r.json) as Medication);
  const logs: Record<string, DoseLog> = {};
  for (const r of db.getAllSync<{ dose_key: string; status: DoseLog["status"]; at: number; check_json: string | null }>(
    "SELECT * FROM logs",
  )) {
    logs[r.dose_key] = { status: r.status, at: r.at, ...(r.check_json ? { check: JSON.parse(r.check_json) } : {}) };
  }
  refs = {};
  for (const r of db.getAllSync<{ med_id: string; json: string }>("SELECT med_id, json FROM refs")) {
    refs[r.med_id] = JSON.parse(r.json);
  }
  const stored: Partial<Settings> = {};
  for (const r of db.getAllSync<{ key: string; value: string }>("SELECT * FROM settings")) {
    (stored as Record<string, unknown>)[r.key] = JSON.parse(r.value);
  }
  state = { meds, logs };
  settings = { ...defaults, ...stored };
  loaded = true;
}

function emit(scheduleChanged: boolean) {
  listeners.forEach((l) => l());
  if (scheduleChanged) changeHooks.forEach((h) => h());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Runs after any change that affects reminders (medicines, logs, privacy setting). */
export function onScheduleChange(hook: () => void) {
  changeHooks.add(hook);
  return () => changeHooks.delete(hook);
}

export function getState(): State {
  load();
  return state;
}

export function getSettings(): Settings {
  load();
  return settings;
}

export function getRefs(): Record<string, StoredReference> {
  load();
  return refs;
}

export const useMeds = () => useSyncExternalStore(subscribe, getState);
export const useSettings = () => useSyncExternalStore(subscribe, getSettings);
export const useRefs = () => useSyncExternalStore(subscribe, getRefs);

/** Adds a medicine and returns its id. */
export function addMedication(med: Omit<Medication, "id" | "createdAt">): string {
  load();
  const full: Medication = { ...med, id: Crypto.randomUUID(), createdAt: Date.now() };
  getDb().runSync("INSERT INTO meds (id, json, created_at) VALUES (?, ?, ?)", full.id, JSON.stringify(full), full.createdAt);
  state = { ...state, meds: [...state.meds, full] };
  emit(true);
  return full.id;
}

export function deleteMedication(id: string) {
  load();
  const db = getDb();
  const prefix = `${id}|`;
  db.withTransactionSync(() => {
    db.runSync("DELETE FROM meds WHERE id = ?", id);
    db.runSync("DELETE FROM logs WHERE substr(dose_key, 1, ?) = ?", prefix.length, prefix);
    db.runSync("DELETE FROM refs WHERE med_id = ?", id);
  });
  const logs = Object.fromEntries(Object.entries(state.logs).filter(([k]) => !k.startsWith(prefix)));
  state = { meds: state.meds.filter((m) => m.id !== id), logs };
  const { [id]: _removed, ...rest } = refs;
  refs = rest;
  emit(true);
}

/** Log (or with null, undo) one or more doses at once, e.g. everything due at 08:00. */
export function logDoses(keys: string[], status: DoseLog["status"] | null, check?: DoseLog["check"], at: number = Date.now()) {
  load();
  const db = getDb();
  const logs = { ...state.logs };
  db.withTransactionSync(() => {
    for (const key of keys) {
      if (status) {
        db.runSync(
          "INSERT OR REPLACE INTO logs (dose_key, status, at, check_json) VALUES (?, ?, ?, ?)",
          key,
          status,
          at,
          check ? JSON.stringify(check) : null,
        );
        logs[key] = { status, at, ...(check ? { check } : {}) };
      } else {
        db.runSync("DELETE FROM logs WHERE dose_key = ?", key);
        delete logs[key];
      }
    }
  });
  state = { ...state, logs };
  emit(true);
}

/** Saves or updates the photo-check reference for a medicine (merged with what is already there). */
export function setReference(medId: string, update: Partial<Omit<StoredReference, "updatedAt">>) {
  load();
  const next: StoredReference = { ...refs[medId], ...update, updatedAt: Date.now() };
  getDb().runSync(
    "INSERT OR REPLACE INTO refs (med_id, json, updated_at) VALUES (?, ?, ?)",
    medId,
    JSON.stringify(next),
    next.updatedAt,
  );
  refs = { ...refs, [medId]: next };
  emit(false);
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  load();
  getDb().runSync("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", key, JSON.stringify(value));
  settings = { ...settings, [key]: value };
  emit(key === "hideNames" || key === "familySharing" || key === "familyMedicineNames");
}

/* ---------- tester mode: accuracy cases (text and fingerprints only, never photos) ---------- */

export function saveTestCase(c: EvalCase) {
  getDb().runSync("INSERT OR REPLACE INTO eval_cases (id, json, created_at) VALUES (?, ?, ?)", c.id, JSON.stringify(c), Date.now());
  emit(false);
}

export function getTestCases(): EvalCase[] {
  return getDb()
    .getAllSync<{ json: string }>("SELECT json FROM eval_cases ORDER BY created_at")
    .map((r) => JSON.parse(r.json) as EvalCase);
}

export function clearTestCases() {
  getDb().runSync("DELETE FROM eval_cases");
  emit(false);
}

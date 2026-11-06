/**
 * Family updates: uploads dose *times and statuses* (never schedules, photos or
 * history) for 24 hours back and 48 hours ahead, so the backend can tell family
 * when a dose isn't confirmed, even if this phone is off.
 *
 * Runs only while the patient has family members set up.
 */
import { buildSlots } from "@dosewise/core";
import { api } from "./cloud";
import { getSettings, getState, setSetting } from "./store";

let queue: Promise<void> = Promise.resolve();

/** Uploads current dose times if family sharing is on. Safe to call often; calls are serialised. */
export function syncFamily(now: Date = new Date()) {
  queue = queue
    .then(async () => {
      const s = getSettings();
      if (!s.familySharing) return;
      const body = buildSlots(getState(), now, s.familyMedicineNames);
      const r = await api<{ stored: boolean }>("PUT", "/v1/slots", body);
      if (!r.stored) setSetting("familySharing", false);
    })
    .catch((e) => console.warn("Family sync failed", (e as Error).message));
  return queue;
}

/** Scheduled jobs (EventBridge Scheduler). */
import { applyRetention, sendDailySummaries, sweepMissedDoses } from "../domain/doses";
import { getDeps } from "./runtime";

export const sweep = async () => console.log("sweep", await sweepMissedDoses(await getDeps()));
export const summaries = async () => console.log("summaries", await sendDailySummaries(await getDeps()));
export const retention = async () => console.log("retention", await applyRetention(await getDeps()));

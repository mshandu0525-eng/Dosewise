/**
 * Reminder health check (PRD R1: 99% of reminders on time, battery saver on).
 *
 * Checks what can be read (notification permission, Android exact alarms, that
 * reminders are actually scheduled) and guides what can't (battery optimisation,
 * which phone makers handle differently).
 */
import * as Device from "expo-device";
import * as IntentLauncher from "expo-intent-launcher";
import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";
import { remindersAllowed, requestReminderPermission, scheduledCount, syncReminders } from "./reminders";
import { getSettings, getState } from "./store";

export type CheckId = "notifications" | "exactAlarms" | "scheduled" | "battery" | "focus";

export interface Check {
  id: CheckId;
  title: string;
  /** ok: fine · problem: reminders will be late or missing · todo: guided step, can't be read */
  state: "ok" | "problem" | "todo";
  detail: string;
  fixLabel?: string;
}

const PACKAGE = "za.dosewise.app";

/** Android 12+ needs "Alarms & reminders" for on-time delivery; without it reminders can be several minutes late. */
async function exactAlarmsAllowed(): Promise<boolean> {
  if (Platform.OS !== "android" || (Device.platformApiLevel ?? 0) < 31) return true;
  return (await Notifications.getExactAlarmPermissionsAsync()).granted;
}

/** Battery advice by phone maker: these are where reminders most often go missing. */
export function batteryAdvice(): string {
  const maker = (Device.manufacturer ?? "").toLowerCase();
  if (maker.includes("samsung"))
    return 'Settings → Battery → Background usage limits → Never sleeping apps → add DoseWise. Also set DoseWise to "Unrestricted" battery use.';
  if (maker.includes("xiaomi") || maker.includes("redmi") || maker.includes("poco"))
    return 'Settings → Apps → DoseWise: turn on Autostart, and set Battery saver to "No restrictions".';
  if (maker.includes("huawei") || maker.includes("honor"))
    return "Settings → Battery → App launch → DoseWise: switch to Manage manually and allow all three options.";
  if (maker.includes("oppo") || maker.includes("realme") || maker.includes("oneplus") || maker.includes("vivo"))
    return 'Settings → Battery → DoseWise: allow background activity and auto-launch, and turn off "Optimise battery use".';
  return 'Settings → Apps → DoseWise → Battery: choose "Unrestricted" (or "Don\'t optimise").';
}

export async function runChecks(): Promise<Check[]> {
  const checks: Check[] = [];
  const notif = await remindersAllowed();
  checks.push({
    id: "notifications",
    title: "Notifications allowed",
    state: notif ? "ok" : "problem",
    detail: notif ? "DoseWise can show reminders." : "Reminders can't appear until you allow notifications.",
    fixLabel: notif ? undefined : "Allow notifications",
  });

  if (Platform.OS === "android") {
    const exact = await exactAlarmsAllowed();
    checks.push({
      id: "exactAlarms",
      title: "Reminders on time",
      state: exact ? "ok" : "problem",
      detail: exact
        ? 'DoseWise is allowed to set "Alarms & reminders".'
        : 'Without "Alarms & reminders", Android can delay reminders by several minutes and critical alarms won\'t ring on time.',
      fixLabel: exact ? undefined : "Allow alarms & reminders",
    });
    checks.push({
      id: "battery",
      title: "Battery saver won't stop reminders",
      state: getSettings().batteryChecked ? "ok" : "todo",
      detail: batteryAdvice(),
      fixLabel: "Open battery settings",
    });
  } else {
    checks.push({
      id: "focus",
      title: "Reminders get through Focus",
      state: getSettings().focusChecked ? "ok" : "todo",
      detail: 'If you use Focus or Do Not Disturb: Settings → Focus → choose the Focus → Apps → add DoseWise, or keep "Time Sensitive Notifications" on for DoseWise.',
      fixLabel: "Open DoseWise settings",
    });
  }

  if (getState().meds.length && notif) {
    await syncReminders();
    const n = await scheduledCount();
    checks.push({
      id: "scheduled",
      title: "Reminders are set",
      state: n > 0 ? "ok" : "problem",
      detail: n > 0 ? `${n} reminders are set for the next 48 hours.` : "No reminders are set. Check your medicine times.",
    });
  }
  return checks;
}

/** True if anything would make reminders late or missing. */
export async function hasProblems(): Promise<boolean> {
  return (await runChecks()).some((c) => c.state === "problem");
}

export async function fix(id: CheckId): Promise<void> {
  switch (id) {
    case "notifications":
      if (!(await requestReminderPermission())) await Linking.openSettings();
      return;
    case "exactAlarms":
      await Notifications.requestExactAlarmPermissionsAsync();
      await syncReminders(); // reschedule as exact alarms
      return;
    case "battery":
      try {
        await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
      } catch {
        await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS, { data: `package:${PACKAGE}` });
      }
      return;
    case "focus":
      await Linking.openSettings();
      return;
    default:
      return;
  }
}

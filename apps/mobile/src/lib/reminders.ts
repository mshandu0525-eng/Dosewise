/**
 * Puts the reminder plan from @dosewise/core onto the phone's own
 * notification and alarm system, so reminders fire offline and with the app closed.
 *
 * - Android: "doses" channel (high importance); "alarms" channel (max importance,
 *   alarm audio, bypasses Do Not Disturb) delivered with AlarmManager.setAlarmClock.
 * - iOS: escalations are Time Sensitive, so they break through Focus modes.
 *   (AlarmKit for full-screen alarms on iOS 26+ needs a native module: next phase.)
 */
import { planReminders, type PlannedReminder } from "@dosewise/core";
import * as Notifications from "expo-notifications";
import {
  AndroidAudioUsage,
  AndroidImportance,
  AndroidNotificationPriority,
  AndroidNotificationVisibility,
  IosAuthorizationStatus,
} from "expo-notifications";
import { Platform } from "react-native";
import { getSettings, getState, logDoses, setSetting } from "./store";

export const CATEGORY = "dose";
const SNOOZE_PREFIX = "snooze|";
export const SNOOZE_MINUTES = 10;

type ReminderData = { doseKeys: string[]; stage: PlannedReminder["stage"] | "snooze"; time: string };

export async function setupNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("doses", {
      name: "Dose reminders",
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 400, 200, 400],
      lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
    });
    await Notifications.setNotificationChannelAsync("alarms", {
      name: "Critical medicine alarms",
      description: "Rings like an alarm when a critical medicine is 30 minutes late.",
      importance: AndroidImportance.MAX,
      bypassDnd: true,
      vibrationPattern: [0, 800, 300, 800, 300, 800],
      lockscreenVisibility: AndroidNotificationVisibility.PRIVATE,
      audioAttributes: { usage: AndroidAudioUsage.ALARM },
    });
  }

  // Android handles these in the background task without opening the app.
  // iOS gives a closed app no callback, so the buttons open it briefly to record the dose.
  const opensApp = Platform.OS === "ios";
  await Notifications.setNotificationCategoryAsync(CATEGORY, [
    { identifier: "taken", buttonTitle: "Taken", options: { opensAppToForeground: opensApp } },
    { identifier: "snooze", buttonTitle: `Snooze ${SNOOZE_MINUTES} min`, options: { opensAppToForeground: opensApp } },
    { identifier: "skip", buttonTitle: "Skip", options: { opensAppToForeground: opensApp, isDestructive: true } },
  ]);
}

export async function remindersAllowed() {
  const p = await Notifications.getPermissionsAsync();
  return p.granted || p.ios?.status === IosAuthorizationStatus.PROVISIONAL;
}

export async function requestReminderPermission() {
  const p = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  if (p.granted) await syncReminders();
  return p.granted;
}

function content(r: { title: string; body: string; data: ReminderData; urgent: boolean }): Notifications.NotificationContentInput {
  return {
    title: r.title,
    body: r.body,
    data: r.data,
    categoryIdentifier: CATEGORY,
    sound: "default",
    interruptionLevel: r.urgent ? "timeSensitive" : "active",
    priority: r.urgent ? AndroidNotificationPriority.MAX : AndroidNotificationPriority.HIGH,
  };
}

let queue: Promise<void> = Promise.resolve();

/** Replace every scheduled reminder with the current plan. Calls are serialised. */
export function syncReminders(now: Date = new Date()): Promise<void> {
  queue = queue.then(() => doSync(now)).catch((e) => console.warn("Reminder sync failed", e));
  return queue;
}

async function doSync(now: Date) {
  if (!(await remindersAllowed())) return;
  const state = getState();
  const plan = planReminders(state, now, { hideNames: getSettings().hideNames });

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const req of scheduled) {
    const id = req.identifier;
    if (id.startsWith(SNOOZE_PREFIX)) {
      const keys = (req.content.data as ReminderData | undefined)?.doseKeys ?? [];
      if (keys.some((k) => !state.logs[k])) continue; // keep snoozes for doses still open
    }
    await Notifications.cancelScheduledNotificationAsync(id);
  }

  for (const r of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: r.id,
      content: content({
        title: r.title,
        body: r.body,
        data: { doseKeys: r.doseKeys, stage: r.stage, time: r.time },
        urgent: r.stage !== "due",
      }),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: r.at,
        channelId: r.stage === "alarm" ? "alarms" : "doses",
        delivery: r.stage === "alarm" ? "alarmClock" : "bestEffort",
      },
    });
  }
}

/** Handles a tap on a reminder or one of its buttons. Returns true if it changed anything. */
export async function handleNotificationResponse(response: Notifications.NotificationResponse): Promise<boolean> {
  const { notification, actionIdentifier } = response;
  const data = notification.request.content.data as ReminderData | undefined;
  if (!data?.doseKeys?.length) return false;

  // The same response can arrive twice (listener and last-response on launch).
  const responseId = `${notification.request.identifier}|${actionIdentifier}|${notification.date}`;
  if (getSettings().lastResponse === responseId) return false;
  setSetting("lastResponse", responseId);

  const open = data.doseKeys.filter((k) => !getState().logs[k]);
  if (actionIdentifier === "taken" || actionIdentifier === "skip") {
    if (open.length) logDoses(open, actionIdentifier === "taken" ? "taken" : "skipped");
  } else if (actionIdentifier === "snooze" && open.length) {
    await Notifications.scheduleNotificationAsync({
      identifier: `${SNOOZE_PREFIX}${notification.request.identifier}|${Date.now()}`,
      content: content({
        title: `Snoozed: your ${data.time} medicine`,
        body: notification.request.content.body ?? "",
        data: { ...data, doseKeys: open, stage: "snooze" },
        urgent: true,
      }),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: Date.now() + SNOOZE_MINUTES * 60_000,
        channelId: "doses",
      },
    });
  } else {
    return false; // plain tap: just opens the app
  }
  await Notifications.dismissNotificationAsync(notification.request.identifier);
  await syncReminders();
  return true;
}

/** Sends one reminder in 5 seconds, so people can check sound and lock-screen settings. */
export async function sendTestReminder() {
  await Notifications.scheduleNotificationAsync({
    content: { title: "DoseWise test reminder", body: "Reminders are working on this phone.", sound: "default" },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: "doses" },
  });
}

export async function scheduledCount() {
  return (await Notifications.getAllScheduledNotificationsAsync()).length;
}

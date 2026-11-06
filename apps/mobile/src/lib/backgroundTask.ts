/**
 * Android only: when someone presses Taken / Skip / Snooze on a reminder while
 * the app is in the background or closed, Android runs this task headless.
 * The dose is written to the encrypted database and the reminder plan
 * refreshed, so later escalations for that dose are cancelled.
 */
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { handleNotificationResponse } from "./reminders";

export const NOTIFICATION_TASK = "dosewise-notification-action";

TaskManager.defineTask<Notifications.NotificationTaskPayload>(NOTIFICATION_TASK, async ({ data, error }) => {
  if (error || !data || !("actionIdentifier" in data)) return Notifications.BackgroundNotificationTaskResult.NoData;
  try {
    const changed = await handleNotificationResponse(data);
    return changed ? Notifications.BackgroundNotificationTaskResult.NewData : Notifications.BackgroundNotificationTaskResult.NoData;
  } catch (e) {
    console.warn("Notification action failed", e);
    return Notifications.BackgroundNotificationTaskResult.Failed;
  }
});

if (Platform.OS === "android") {
  Notifications.registerTaskAsync(NOTIFICATION_TASK).catch((e) => console.warn("Task registration failed", e));
}

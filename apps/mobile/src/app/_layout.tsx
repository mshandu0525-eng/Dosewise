import * as Notifications from "expo-notifications";
import type { ErrorBoundaryProps } from "expo-router";
import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { reportError } from "@/lib/crash";
import { syncFamily } from "@/lib/family";
import { handleNotificationResponse, setupNotifications, syncReminders } from "@/lib/reminders";
import { onScheduleChange } from "@/lib/store";
import { useTheme } from "@/lib/theme";

function useReminderEngine() {
  useEffect(() => {
    setupNotifications().then(() => syncReminders());
    void syncFamily();

    // Any change to medicines or logs re-plans reminders (and cancels escalations for logged doses).
    const offChange = onScheduleChange(() => {
      void syncReminders();
      void syncFamily();
    });

    // The plan is a rolling 48-hour window, so top it up whenever the app comes back.
    const appState = AppState.addEventListener("change", (s) => {
      if (s !== "active") return;
      void syncReminders();
      void syncFamily();
    });

    // Taps and button presses while the app is running, and the one that launched it (iOS).
    const responses = Notifications.addNotificationResponseReceivedListener((r) => void handleNotificationResponse(r));
    const launch = Notifications.getLastNotificationResponse();
    if (launch) void handleNotificationResponse(launch);

    return () => {
      offChange();
      appState.remove();
      responses.remove();
    };
  }, []);
}

/** A screen crashed: report it (scrubbed, if allowed) and offer a way back without losing data. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => reportError(error), [error]);
  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16, backgroundColor: "#F6F4EF" }}>
      <Text accessibilityRole="header" style={{ fontSize: 26, fontWeight: "700", color: "#1A1D21" }}>
        Something went wrong
      </Text>
      <Text style={{ fontSize: 18, color: "#1A1D21" }}>Your medicines and history are safe. Your reminders are still set.</Text>
      <Text
        accessibilityRole="button"
        onPress={() => void retry()}
        style={{ fontSize: 20, fontWeight: "700", color: "#FFFFFF", backgroundColor: "#1D5C54", textAlign: "center", padding: 18, borderRadius: 999 }}
      >
        Try again
      </Text>
    </View>
  );
}

export default function RootLayout() {
  const t = useTheme();
  useReminderEngine();
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTintColor: t.colors.primary,
          headerTitleStyle: { fontSize: t.size.heading, color: t.colors.text },
          contentStyle: { backgroundColor: t.colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="add" options={{ presentation: "modal", title: "New medication" }} />
        <Stack.Screen name="scan" options={{ presentation: "fullScreenModal", headerShown: false }} />
        <Stack.Screen name="family" options={{ title: "Family updates" }} />
        <Stack.Screen name="welcome" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="reminder-check" options={{ title: "Reminder check" }} />
        <Stack.Screen name="about" options={{ title: "About" }} />
      </Stack>
    </SafeAreaProvider>
  );
}

import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Button, Card, Row, Screen, T } from "@/components/ui";
import { fix, runChecks, type Check } from "@/lib/health";
import { sendTestReminder } from "@/lib/reminders";
import { setSetting } from "@/lib/store";
import { useTheme } from "@/lib/theme";

export default function ReminderCheck() {
  const t = useTheme();
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const [checks, setChecks] = useState<Check[] | null>(null);

  const refresh = useCallback(() => {
    void runChecks().then(setChecks);
  }, []);
  // Re-check when coming back from the phone's settings.
  useFocusEffect(refresh);

  const look = {
    ok: { icon: "checkmark-circle" as const, color: t.colors.success, word: "Done" },
    problem: { icon: "alert-circle" as const, color: t.colors.danger, word: "Needs fixing" },
    todo: { icon: "ellipse-outline" as const, color: t.colors.warning, word: "To do" },
  };

  const markDone = (c: Check) => {
    if (c.id === "battery") setSetting("batteryChecked", true);
    if (c.id === "focus") setSetting("focusChecked", true);
    refresh();
  };

  return (
    <Screen>
      <T kind="title" accessibilityRole="header">
        Make sure reminders arrive
      </T>
      <T muted>Phones save battery by delaying apps. These steps keep your reminders on time.</T>
      {!checks && <ActivityIndicator color={t.colors.primary} />}
      {checks?.map((c) => {
        const l = look[c.state];
        return (
          <Card key={c.id}>
            <Row style={{ alignItems: "flex-start" }}>
              <Ionicons name={l.icon} size={t.size.icon + 4} color={l.color} accessibilityElementsHidden />
              <View style={{ flex: 1, gap: 4 }}>
                <T bold accessibilityLabel={`${c.title}: ${l.word}`}>
                  {c.title}
                </T>
                <T kind="small" muted>
                  {c.detail}
                </T>
              </View>
            </Row>
            {c.state !== "ok" && c.fixLabel && <Button variant={c.state === "problem" ? "primary" : "outline"} label={c.fixLabel} onPress={() => void fix(c.id).then(refresh)} />}
            {c.state === "todo" && <Button variant="ghost" icon="checkmark" label="I've done this" onPress={() => markDone(c)} />}
          </Card>
        );
      })}
      <Button variant="outline" icon="notifications" label="Send a test reminder" onPress={() => void sendTestReminder()} />
      {onboarding && <Button icon="arrow-forward" label="Continue" onPress={() => router.replace("/")} />}
    </Screen>
  );
}

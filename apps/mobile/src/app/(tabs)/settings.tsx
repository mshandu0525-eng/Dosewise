import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Share, Switch, View } from "react-native";
import { Button, Card, Row, Screen, T } from "@/components/ui";
import { remindersAllowed, requestReminderPermission, scheduledCount, sendTestReminder } from "@/lib/reminders";
import { clearTestCases, getTestCases, setSetting, useSettings, type Settings } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import { TESTER_BUILD } from "@/lib/tester";
import { crashReportingAvailable, sendTestCrashReport, setCrashReporting } from "@/lib/crash";

function Toggle({ k, title, detail }: { k: "easyView" | "hideNames" | "speak" | "collectTestCases"; title: string; detail: string }) {
  const t = useTheme();
  const settings = useSettings();
  const value = settings[k] as Settings[typeof k];
  return (
    <Card>
      <Row style={{ justifyContent: "space-between" }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T bold>{title}</T>
          <T kind="small" muted>
            {detail}
          </T>
        </View>
        <Switch
          accessibilityLabel={title}
          value={value}
          onValueChange={(v) => setSetting(k, v)}
          trackColor={{ true: t.colors.primary, false: t.colors.border }}
          style={t.easy ? { transform: [{ scale: 1.4 }] } : undefined}
        />
      </Row>
    </Card>
  );
}

export default function SettingsScreen() {
  const t = useTheme();
  const settings = useSettings();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    void remindersAllowed().then(setAllowed);
    void scheduledCount().then(setCount);
  }, []);
  useFocusEffect(refresh);

  return (
    <Screen>
      <T kind="title" accessibilityRole="header">
        Settings
      </T>

      {t.easy && (
        <Card>
          <T bold>More</T>
          <Button variant="outline" icon="medkit" label="My medicines" onPress={() => router.push("/medications")} />
          <Button variant="outline" icon="bar-chart" label="Monthly report" onPress={() => router.push("/report")} />
        </Card>
      )}

      <T kind="heading">Family</T>
      <Card>
        <T bold>Family updates</T>
        <T kind="small" muted>
          {settings.familySharing ? "On: family can be told if a dose isn't confirmed." : "Let family know on WhatsApp if you miss a dose."}
        </T>
        <Button variant="outline" icon="people" label="Family updates" onPress={() => router.push("/family")} />
      </Card>

      <T kind="heading">Display</T>
      <Toggle k="easyView" title="Easy View" detail="Larger text and buttons, fewer screens, spoken confirmations." />
      <Toggle k="speak" title="Read confirmations aloud" detail="In Easy View, says what was logged after each tap." />

      <T kind="heading">Reminders</T>
      <Card>
        <T bold>{allowed ? "Reminders are on" : "Reminders are off"}</T>
        <T kind="small" muted>
          {allowed
            ? `${count} reminders are set on this phone for the next 48 hours. They work without internet.`
            : "Allow notifications so DoseWise can remind you when a dose is due."}
        </T>
        <Button variant="outline" icon="alarm" label="Check reminders are working" onPress={() => router.push("/reminder-check")} />
        {allowed ? (
          <Button variant="outline" icon="notifications" label="Send a test reminder" onPress={() => void sendTestReminder()} />
        ) : (
          <Button icon="notifications" label="Allow reminders" onPress={() => void requestReminderPermission().then(refresh)} />
        )}
      </Card>

      <T kind="heading">Privacy</T>
      <Toggle k="hideNames" title="Hide medicine names on lock screen" detail='Reminders say "2 medicines" instead of their names.' />
      {crashReportingAvailable && <CrashToggle />}
      <Card>
        <T kind="small" muted>
          Your medicines, history and pill photos are stored only on this phone, in an encrypted database. Photo checks run
          on this phone and the photos are deleted straight after. Nothing is sent to DoseWise or anyone else.
        </T>
      </Card>

      <Button variant="outline" icon="information-circle" label="About, privacy and feedback" onPress={() => router.push("/about")} />

      {TESTER_BUILD && <TesterSection />}
    </Screen>
  );
}

/** For the photo-check accuracy study: collects the text read from each check (never the photo). */
function TesterSection() {
  const { collectTestCases } = useSettings();
  const cases = collectTestCases ? getTestCases() : [];
  return (
    <>
      <T kind="heading">Testing</T>
      <Toggle
        k="collectTestCases"
        title="Photo check tester mode"
        detail="For accuracy testing only. After each check you say what was in the photo, and the text read from the label is saved. Photos are never saved."
      />
      {crashReportingAvailable && (
        <Button
          variant="outline"
          icon="bug"
          label="Send a test crash report"
          onPress={() => {
            const sent = sendTestCrashReport();
            Alert.alert(
              sent ? "Test report sent" : "Crash reports are off",
              sent ? "It should appear in Sentry (dosewise-mobile) within a minute." : 'Turn on "Send anonymous crash reports" in Privacy first.',
            );
          }}
        />
      )}
      {collectTestCases && (
        <Card>
          <T bold>{cases.length} test cases saved</T>
          <Button
            variant="outline"
            icon="share"
            label="Share test cases"
            disabled={!cases.length}
            onPress={() => void Share.share({ title: "DoseWise photo check cases", message: JSON.stringify(cases, null, 1) })}
          />
          <Button
            variant="danger"
            icon="trash"
            label="Delete test cases"
            disabled={!cases.length}
            onPress={() =>
              Alert.alert("Delete all test cases?", "This can't be undone.", [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: clearTestCases },
              ])
            }
          />
        </Card>
      )}
    </>
  );
}

/** Crash reports: applies immediately in both directions. */
function CrashToggle() {
  const t = useTheme();
  const { crashReports } = useSettings();
  return (
    <Card>
      <Row style={{ justifyContent: "space-between" }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T bold>Send anonymous crash reports</T>
          <T kind="small" muted>
            If DoseWise crashes, send the technical details (app version, phone model, where the code failed) to help fix it.
            Never your medicines, history, photos, name or number.
          </T>
        </View>
        <Switch
          accessibilityLabel="Send anonymous crash reports"
          value={crashReports}
          onValueChange={(v) => {
            setSetting("crashReports", v);
            void setCrashReporting(v);
          }}
          trackColor={{ true: t.colors.primary, false: t.colors.border }}
        />
      </Row>
    </Card>
  );
}

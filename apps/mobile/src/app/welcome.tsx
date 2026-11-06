/**
 * First run: what DoseWise is (and isn't), where data lives, and Standard vs Easy View.
 * Easy View is pre-selected when the phone already uses large text (PRD open question).
 */
import { router } from "expo-router";
import { useState } from "react";
import { PixelRatio, Switch, View } from "react-native";
import { Button, Card, Chip, Row, Screen, T } from "@/components/ui";
import { crashReportingAvailable, setCrashReporting } from "@/lib/crash";
import { LEGAL_VERSION, openPrivacyPolicy } from "@/lib/legal";
import { getSettings, setSetting } from "@/lib/store";
import { useTheme } from "@/lib/theme";

export default function Welcome() {
  const t = useTheme();
  const [easy, setEasy] = useState(() => PixelRatio.getFontScale() >= 1.3);
  const [crash, setCrash] = useState(() => getSettings().crashReports);

  const choose = (v: boolean) => {
    setEasy(v);
    setSetting("easyView", v); // preview the choice straight away
  };

  const accept = () => {
    setSetting("easyView", easy);
    setSetting("crashReports", crash);
    void setCrashReporting(crash);
    setSetting("acceptedLegalVersion", LEGAL_VERSION);
    router.replace({ pathname: "/reminder-check", params: { onboarding: "1" } });
  };

  return (
    <Screen>
      <T kind="title" accessibilityRole="header">
        Welcome to DoseWise
      </T>
      <T>Reminders for your medicines, using your phone&apos;s own alarms, so they work without internet.</T>

      <T kind="heading">Which suits you?</T>
      <Row wrap>
        <Chip label="Standard" selected={!easy} onPress={() => choose(false)} />
        <Chip label="Easy View: larger text and buttons" selected={easy} onPress={() => choose(true)} />
      </Row>
      <T kind="small" muted>
        You can change this any time in Settings.
      </T>

      <Card>
        <T bold>Your information stays on this phone</T>
        <T kind="small" muted>
          Your medicines, history and pill photos are kept only on this phone, in encrypted storage. If you later choose family
          updates, only your dose times are sent online, and only to the people you pick.
        </T>
      </Card>

      <Card>
        <T bold>Please note</T>
        <T kind="small" muted>
          DoseWise helps you remember and record your medicines. It does not give medical advice, and it can&apos;t replace your
          doctor or pharmacist. Always follow their instructions. Photo checks help you spot the wrong box or strength, but they
          can make mistakes: if in doubt, ask your pharmacist before taking a dose. In an emergency, call 10177 or 112.
        </T>
      </Card>

      {crashReportingAvailable && (
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T bold>Help fix problems</T>
              <T kind="small" muted>
                Send anonymous crash reports. They never include your medicines, history, photos, name or number.
              </T>
            </View>
            <Switch accessibilityLabel="Send anonymous crash reports" value={crash} onValueChange={setCrash} trackColor={{ true: t.colors.primary, false: t.colors.border }} />
          </Row>
        </Card>
      )}

      <Button variant="ghost" icon="document-text" label="Read the privacy policy" onPress={() => void openPrivacyPolicy()} />
      <Button icon="checkmark" label="I understand, continue" onPress={accept} />
    </Screen>
  );
}

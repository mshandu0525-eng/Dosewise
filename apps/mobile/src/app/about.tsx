import { router } from "expo-router";
import { Button, Card, Screen, T } from "@/components/ui";
import { appVersion, emailSupport, openPrivacyPolicy } from "@/lib/legal";

export default function About() {
  return (
    <Screen>
      <T kind="title" accessibilityRole="header">
        About DoseWise
      </T>
      <T muted>Version {appVersion()}</T>

      <Card>
        <T bold>Not medical advice</T>
        <T kind="small" muted>
          DoseWise helps you remember and record your medicines. It does not diagnose, treat or give dosing advice. Follow your
          doctor&apos;s and pharmacist&apos;s instructions. Photo checks can make mistakes; if in doubt, ask your pharmacist. In an
          emergency, call 10177 or 112.
        </T>
      </Card>

      <Card>
        <T bold>What DoseWise keeps, and where</T>
        <T kind="small" muted>
          On this phone only, encrypted: your medicines, reminder times, dose history and pill photos. Online, only if you turn
          on family updates: your phone number, the name family sees, your family members&apos; names and numbers, and your dose
          times for the past day and next two days, stored in South Africa. You can download or delete this from Family updates.
        </T>
      </Card>

      <Button variant="outline" icon="document-text" label="Privacy policy" onPress={() => void openPrivacyPolicy()} />
      <Button variant="outline" icon="mail" label="Send feedback or report a problem" onPress={() => void emailSupport()} />
      <Button variant="ghost" icon="alarm" label="Check reminders are working" onPress={() => router.push("/reminder-check")} />
    </Screen>
  );
}

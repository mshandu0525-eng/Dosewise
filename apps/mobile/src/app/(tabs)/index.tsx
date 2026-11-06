import { dateKey, dosesForDate, type Dose } from "@dosewise/core";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import * as Speech from "expo-speech";
import { useCallback, useEffect, useState } from "react";
import { Image, View } from "react-native";
import { Button, Card, ProgressBar, Row, Screen, StatusBadge, T } from "@/components/ui";
import { hasProblems } from "@/lib/health";
import { getSettings, logDoses, useMeds, useRefs, useSettings } from "@/lib/store";
import { useTheme } from "@/lib/theme";

const UNDO_MINUTES = 10;

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function record(dose: Dose, status: "taken" | "skipped" | null) {
  logDoses([dose.key], status);
  void Haptics.notificationAsync(
    status === "taken" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
  );
  const { easyView, speak } = getSettings();
  if (easyView && speak) {
    const phrase =
      status === "taken"
        ? `Logged ${dose.med.name}, ${dose.med.dosage}. Tap undo if that was a mistake.`
        : status === "skipped"
          ? `${dose.med.name} skipped.`
          : "Undone.";
    Speech.speak(phrase);
  }
}

function DoseCard({ dose, now, hero }: { dose: Dose; now: Date; hero?: boolean }) {
  const t = useTheme();
  const { logs } = useMeds();
  const ref = useRefs()[dose.med.id];
  const open = dose.status !== "taken" && dose.status !== "skipped";
  const log = logs[dose.key];
  const verified = log?.check?.result === "match";
  const pillSize = t.easy ? 72 : 52;
  const canUndo = !!log && now.getTime() - log.at < UNDO_MINUTES * 60_000;
  const details = [dose.med.dosage, dose.med.form, dose.med.instructions].filter(Boolean).join(" · ");
  return (
    <Card style={hero ? { borderWidth: 3, borderColor: t.colors.primary } : undefined}>
      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        {ref?.pillPhoto && (
          <Image
            source={{ uri: `data:image/jpeg;base64,${ref.pillPhoto}` }}
            accessibilityLabel={`Your ${dose.med.name} pill`}
            style={{ width: pillSize, height: pillSize, borderRadius: 12 }}
          />
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <T kind="small" muted bold>
            {dose.time}
            {dose.med.critical ? "  ·  Critical" : ""}
          </T>
          <T kind="heading">{dose.med.name}</T>
          <T muted>{details}</T>
        </View>
        <StatusBadge status={dose.status} />
      </Row>
      {open && (
        <View style={{ flexDirection: t.easy ? "column" : "row", gap: 8, marginTop: 4 }}>
          <Button flex={!t.easy} icon="checkmark" label="Taken" hint={`Marks ${dose.med.name} as taken`} onPress={() => record(dose, "taken")} />
          <Button flex={!t.easy} variant="outline" icon="play-skip-forward" label="Skip" onPress={() => record(dose, "skipped")} />
        </View>
      )}
      {open && (
        <Button
          variant="ghost"
          icon="camera"
          label="Check with camera"
          hint={`Photographs the box or pill and checks it is ${dose.med.name} ${dose.med.dosage} before logging`}
          onPress={() => router.push({ pathname: "/scan", params: { mode: "verify", medId: dose.med.id, doseKey: dose.key } })}
        />
      )}
      {verified && (
        <T kind="small" bold color={t.colors.success}>
          ✓ Photo-verified
        </T>
      )}
      {!open && canUndo && (
        <Row>
          <Button variant="ghost" icon="arrow-undo" label="Undo" hint={`Clears the log for ${dose.med.name}`} onPress={() => record(dose, null)} />
        </Row>
      )}
    </Card>
  );
}

/** Shows when anything would make reminders late or missing (permission, Android exact alarms, nothing scheduled). */
function ReminderBanner() {
  const [problem, setProblem] = useState(false);
  useFocusEffect(
    useCallback(() => {
      void hasProblems().then(setProblem);
    }, []),
  );
  if (!problem) return null;
  return (
    <Card>
      <T kind="heading">Your reminders may not arrive on time</T>
      <T muted>{"There's a setting on this phone that needs changing. It takes a minute."}</T>
      <Button icon="alarm" label="Fix reminders" onPress={() => router.push("/reminder-check")} />
    </Card>
  );
}

/** PRD consent flow: remind the patient every 90 days who can see their updates. */
function FamilyReview({ now }: { now: Date }) {
  const { familySharing, familyReviewedAt } = useSettings();
  if (!familySharing || now.getTime() - familyReviewedAt < 90 * 86_400_000) return null;
  return (
    <Card>
      <T kind="heading">Check who gets your updates</T>
      <T muted>It has been a while. Make sure you still want these family members to be told about missed doses.</T>
      <Button variant="outline" icon="people" label="Review family updates" onPress={() => router.push("/family")} />
    </Card>
  );
}

export default function Today() {
  const t = useTheme();
  const state = useMeds();
  const now = useNow();
  const doses = dosesForDate(state, dateKey(now), now);
  const taken = doses.filter((d) => d.status === "taken").length;
  const next = doses.find((d) => d.status === "due") ?? doses.find((d) => d.status === "upcoming");
  const rest = t.easy && next ? doses.filter((d) => d.key !== next.key) : doses;

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <T muted>{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</T>
        <T kind="title" accessibilityRole="header">
          {doses.length ? `${taken} of ${doses.length} doses taken` : "Nothing scheduled today"}
        </T>
        {doses.length > 0 && <ProgressBar value={(taken / doses.length) * 100} label={`${taken} of ${doses.length} doses taken`} />}
      </View>

      <ReminderBanner />
      <FamilyReview now={now} />

      {state.meds.length === 0 ? (
        <Card>
          <T kind="heading">Add your first medicine</T>
          <T muted>Enter the name, dose and times. It takes under two minutes.</T>
          <Button icon="add" label="Add medicine" onPress={() => router.push("/add")} />
        </Card>
      ) : (
        <>
          {t.easy && next && (
            <>
              <T kind="heading" accessibilityRole="header">
                {next.status === "due" ? "Take now" : "Next"}
              </T>
              <DoseCard dose={next} now={now} hero />
              {rest.length > 0 && (
                <T kind="heading" accessibilityRole="header">
                  Rest of today
                </T>
              )}
            </>
          )}
          {rest.map((d) => (
            <DoseCard key={d.key} dose={d} now={now} />
          ))}
          <Button variant="outline" icon="add" label="Add medicine" onPress={() => router.push("/add")} />
        </>
      )}
    </Screen>
  );
}

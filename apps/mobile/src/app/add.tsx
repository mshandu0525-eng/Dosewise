import { dateKey, pad } from "@dosewise/core";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Switch, TextInput, View } from "react-native";
import { Button, Card, Chip, Row, T } from "@/components/ui";
import { takeLabelScan, type LabelScan } from "@/lib/scanHandoff";
import { addMedication, setReference } from "@/lib/store";
import { useTheme } from "@/lib/theme";

const FORMS = ["Tablet", "Capsule", "Liquid", "Injection", "Inhaler", "Drops", "Patch"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const PRESETS: [string, string[]][] = [
  ["Morning", ["08:00"]],
  ["Morning and evening", ["08:00", "20:00"]],
  ["Three times a day", ["08:00", "14:00", "20:00"]],
  ["Bedtime", ["21:00"]],
];

function shiftTime(time: string, minutes: number) {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** Large +/− steppers instead of a picker wheel: easier to hit and to hear with a screen reader. */
function TimeStepper({ value, onChange, onRemove }: { value: string; onChange: (v: string) => void; onRemove?: () => void }) {
  const t = useTheme();
  return (
    <Card style={{ gap: 6 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Button variant="outline" icon="remove" iconOnly label={`Earlier, currently ${value}`} onPress={() => onChange(shiftTime(value, -15))} />
        <T kind="title" accessibilityLabel={`Reminder at ${value}`} style={{ fontVariant: ["tabular-nums"] }}>
          {value}
        </T>
        <Button variant="outline" icon="add" iconOnly label={`Later, currently ${value}`} onPress={() => onChange(shiftTime(value, 15))} />
      </Row>
      <Row style={{ justifyContent: "center" }}>
        <Button variant="ghost" label="−1 hour" onPress={() => onChange(shiftTime(value, -60))} />
        <Button variant="ghost" label="+1 hour" onPress={() => onChange(shiftTime(value, 60))} />
        {onRemove && <Button variant="ghost" icon="close" iconOnly label={`Remove ${value}`} onPress={onRemove} />}
      </Row>
      {t.easy && (
        <T kind="small" muted style={{ textAlign: "center" }}>
          − and + move the time by 15 minutes
        </T>
      )}
    </Card>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <T bold>{label}</T>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.colors.muted}
        {...props}
        style={{
          minHeight: t.size.target,
          fontSize: t.size.body,
          color: t.colors.text,
          borderWidth: 2,
          borderColor: t.colors.border,
          borderRadius: 12,
          paddingHorizontal: 14,
          backgroundColor: t.colors.card,
        }}
      />
    </View>
  );
}

export default function AddMedication() {
  const t = useTheme();
  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [form, setForm] = useState("Tablet");
  const [instructions, setInstructions] = useState("");
  const [times, setTimes] = useState<string[]>(["08:00"]);
  const [everyDay, setEveryDay] = useState(true);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [critical, setCritical] = useState(false);
  const [error, setError] = useState("");
  const [scan, setScan] = useState<LabelScan | null>(null);
  const [setupPhotoCheck, setSetupPhotoCheck] = useState(true);

  // Pick up the result when coming back from "Scan the box".
  useFocusEffect(
    useCallback(() => {
      const s = takeLabelScan();
      if (!s) return;
      setScan(s);
      if (s.name) setName(s.name);
      if (s.strength) setDosage(s.strength);
    }, []),
  );

  const save = () => {
    const cleanTimes = [...new Set(times)].sort();
    if (!name.trim() || !dosage.trim()) return setError("Please enter the medicine name and dose.");
    if (!everyDay && !days.length) return setError("Pick at least one day.");
    const id = addMedication({
      name: name.trim(),
      dosage: dosage.trim(),
      form,
      instructions: instructions.trim(),
      times: cleanTimes,
      days: everyDay ? [] : [...days].sort(),
      startDate: dateKey(new Date()),
      critical,
    });
    if (scan) {
      setReference(id, {
        labelText: scan.lines,
        strengths: scan.strengths.length ? scan.strengths : undefined,
        barcode: scan.barcode,
        boxPhoto: scan.boxPhoto,
      });
    }
    if (setupPhotoCheck) {
      // The box was already scanned, so go straight to the pill photo.
      router.replace({ pathname: "/scan", params: { mode: "reference", medId: id, ...(scan ? { start: "pill" } : {}) } });
    } else {
      router.back();
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: t.size.gap, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Button
          variant="outline"
          icon="scan"
          label={scan ? "Scan the box again" : "Scan the box to fill this in"}
          hint="Reads the name and strength from the label with the camera"
          onPress={() => router.push({ pathname: "/scan", params: { mode: "fill" } })}
        />
        {scan && (
          <T kind="small" muted accessibilityLiveRegion="polite">
            {"Filled in from the label. Please check the name and dose are right."}
          </T>
        )}
        <Card style={{ gap: 14 }}>
          <Field label="Medicine name" value={name} onChangeText={setName} placeholder="e.g. Metformin" maxLength={80} autoCapitalize="words" />
          <Field label="Dose" value={dosage} onChangeText={setDosage} placeholder="e.g. 500 mg or 1 tablet" maxLength={40} />
          <T bold>Form</T>
          <Row wrap>
            {FORMS.map((f) => (
              <Chip key={f} label={f} selected={form === f} onPress={() => setForm(f)} />
            ))}
          </Row>
          <Field label="Instructions (optional)" value={instructions} onChangeText={setInstructions} placeholder="e.g. After breakfast" maxLength={80} />
        </Card>

        <T kind="heading">When to take it</T>
        <Row wrap>
          {PRESETS.map(([label, preset]) => (
            <Chip key={label} label={label} selected={times.join() === preset.join()} onPress={() => setTimes(preset)} />
          ))}
        </Row>
        {times.map((time, i) => (
          <TimeStepper
            key={i}
            value={time}
            onChange={(v) => setTimes(times.map((x, j) => (j === i ? v : x)))}
            onRemove={times.length > 1 ? () => setTimes(times.filter((_, j) => j !== i)) : undefined}
          />
        ))}
        <Button variant="outline" icon="add" label="Add another time" onPress={() => setTimes([...times, shiftTime(times.at(-1) ?? "08:00", 240)])} />

        <T kind="heading">Which days</T>
        <Row wrap>
          <Chip label="Every day" selected={everyDay} onPress={() => setEveryDay(true)} />
          <Chip label="Some days" selected={!everyDay} onPress={() => setEveryDay(false)} />
        </Row>
        {!everyDay && (
          <Row wrap>
            {DAYS.map((d, i) => (
              <Chip key={d} label={d} selected={days.includes(i)} onPress={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i])} />
            ))}
          </Row>
        )}

        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T bold>Critical medicine</T>
              <T kind="small" muted>
                Rings like an alarm if not logged 30 minutes after the reminder.
              </T>
            </View>
            <Switch
              accessibilityLabel="Critical medicine"
              value={critical}
              onValueChange={setCritical}
              trackColor={{ true: t.colors.primary, false: t.colors.border }}
            />
          </Row>
        </Card>

        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T bold>Set up photo check next</T>
              <T kind="small" muted>
                Take a photo of the box and one pill, so DoseWise can check you have the right medicine and strength.
              </T>
            </View>
            <Switch
              accessibilityLabel="Set up photo check next"
              value={setupPhotoCheck}
              onValueChange={setSetupPhotoCheck}
              trackColor={{ true: t.colors.primary, false: t.colors.border }}
            />
          </Row>
        </Card>

        <T kind="small" muted>
          {"Times follow your phone's local time, so reminders adjust when you travel."}
        </T>
        {error ? (
          <T bold color={t.colors.danger} accessibilityLiveRegion="polite">
            {error}
          </T>
        ) : null}
        <Button icon="checkmark" label="Save medicine" onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

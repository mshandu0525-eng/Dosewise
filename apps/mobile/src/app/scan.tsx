/**
 * Camera screen for photo verification (PRD R3/R4). Three modes:
 *  - fill:      scan a box to pre-fill the Add form
 *  - reference: capture the box (label + barcode) and one pill at setup
 *  - verify:    check the box or pill at dose time, then log
 *
 * Everything runs on the phone. Dose-time photos are deleted right after
 * processing; at setup only small thumbnails are kept, inside the encrypted database.
 */
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  guessFromLabel,
  normaliseBarcode,
  parseStrengths,
  verify,
  type EvalCase,
  type Observation,
  type Verification,
} from "@dosewise/core";
import * as Crypto from "expo-crypto";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import * as Speech from "expo-speech";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Card, Chip, Row, T } from "@/components/ui";
import { putLabelScan } from "@/lib/scanHandoff";
import { getRefs, getSettings, logDoses, saveTestCase, setReference, useMeds, useRefs, useSettings } from "@/lib/store";
import { TESTER_BUILD } from "@/lib/tester";
import { useTheme } from "@/lib/theme";
import { GUIDE_FRACTION, discardPhoto, fingerprintPill, readText, thumbnail, type Photo } from "@/lib/vision";

type Mode = "fill" | "reference" | "verify";
type Subject = "box" | "pill";
type Phase =
  | { kind: "camera" }
  | { kind: "working" }
  | { kind: "message"; title: string; body: string; ok: boolean }
  | { kind: "result"; v: Verification; logged: boolean; testCase?: Omit<EvalCase, "expected"> };

const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e", "datamatrix", "code128"] as const;

const HELP: Record<Subject, string> = {
  box: "Hold the box flat inside the frame, with the name and strength facing you.",
  pill: "Put one pill on a plain surface inside the frame. A dark surface works best for white pills.",
};

export default function Scan() {
  const t = useTheme();
  const params = useLocalSearchParams<{ mode?: Mode; medId?: string; doseKey?: string; start?: Subject }>();
  const mode: Mode = params.mode ?? "verify";
  const { meds } = useMeds();
  const refs = useRefs();
  const { collectTestCases } = useSettings();
  const med = meds.find((m) => m.id === params.medId);
  const ref = params.medId ? refs[params.medId] : undefined;

  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const barcode = useRef<string | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>({ kind: "camera" });
  const [subject, setSubject] = useState<Subject>(
    params.start ?? (mode === "verify" && ref?.pill && !ref.barcode && !ref.strengths?.length ? "pill" : "box"),
  );
  const { width, height } = useWindowDimensions();
  const guide = Math.min(width, height) * GUIDE_FRACTION;

  const title =
    mode === "fill" ? "Scan the box" : mode === "reference" ? (subject === "box" ? "Step 1 of 2: the box" : params.start === "pill" ? "Photo of one pill" : "Step 2 of 2: one pill") : `Check ${med?.name ?? "medicine"}`;

  const onBarcode = (r: BarcodeScanningResult) => {
    const gtin = normaliseBarcode(r.data);
    if (gtin && gtin !== barcode.current) {
      barcode.current = gtin;
      void Haptics.selectionAsync();
    }
  };

  async function capture() {
    const cam = camera.current;
    if (!cam) return;
    const pic = await cam.takePictureAsync({ quality: 0.8 });
    const photo: Photo = { uri: pic.uri, width: pic.width, height: pic.height };
    setPhase({ kind: "working" });
    try {
      if (mode === "fill") await doFill(photo);
      else if (mode === "reference") await doReference(photo);
      else await doVerify(photo);
    } catch (e) {
      console.warn("Photo check failed", e);
      setPhase({ kind: "message", ok: false, title: "Something went wrong", body: "The photo couldn't be processed. Please try again." });
    } finally {
      discardPhoto(photo.uri);
    }
  }

  async function doFill(photo: Photo) {
    const lines = await readText(photo);
    const guess = guessFromLabel(lines);
    if (!lines.length || (!guess.name && !guess.strength)) {
      setPhase({ kind: "message", ok: false, title: "Couldn't read the label", body: "Try again in better light, holding the box flat and still." });
      return;
    }
    putLabelScan({ ...guess, barcode: barcode.current, lines, strengths: parseStrengths(lines.join("\n")), boxPhoto: await thumbnail(photo) });
    router.back();
  }

  async function doReference(photo: Photo) {
    if (!med) return;
    if (subject === "box") {
      const lines = await readText(photo);
      const strengths = parseStrengths(lines.join("\n"));
      setReference(med.id, {
        labelText: lines,
        strengths: strengths.length ? strengths : undefined,
        barcode: barcode.current,
        boxPhoto: await thumbnail(photo),
      });
      barcode.current = undefined;
      setSubject("pill");
      setPhase({ kind: "camera" });
      return;
    }
    const pill = await fingerprintPill(photo);
    if (!pill) {
      setPhase({ kind: "message", ok: false, title: "Couldn't see the pill", body: HELP.pill });
      return;
    }
    setReference(med.id, { pill, pillPhoto: await thumbnail(photo, 240) });
    setPhase({ kind: "message", ok: true, title: "Photo check is ready", body: `Next time, tap "Check with camera" on a ${med.name} dose.` });
  }

  async function doVerify(photo: Photo) {
    if (!med) return;
    const seen: Observation =
      subject === "box" ? { barcode: barcode.current, text: await readText(photo) } : { pill: await fingerprintPill(photo) };
    const reference = getRefs()[med.id];
    const v = verify(med, reference, seen);
    const logged = v.result === "match" && !!params.doseKey;
    if (logged) logDoses([params.doseKey!], "taken", { result: "match", method: v.method });
    void Haptics.notificationAsync(
      v.result === "match" ? Haptics.NotificationFeedbackType.Success : v.result === "unsure" ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Error,
    );
    const { easyView, speak } = getSettings();
    if (easyView && speak) Speech.speak(logged ? `Matches. Logged ${med.name}.` : v.reason);
    const testCase = TESTER_BUILD && collectTestCases
      ? {
          id: Crypto.randomUUID(),
          med: { name: med.name, dosage: med.dosage },
          reference: reference && { barcode: reference.barcode, strengths: reference.strengths, pill: reference.pill },
          seen,
        }
      : undefined;
    setPhase({ kind: "result", v, logged, testCase });
  }

  function logAnyway(v: Verification) {
    if (params.doseKey) logDoses([params.doseKey], "taken", { result: v.result });
    router.back();
  }

  function labelTestCase(expected: EvalCase["expected"]) {
    if (phase.kind === "result" && phase.testCase) saveTestCase({ ...phase.testCase, expected });
    setPhase({ ...(phase as Extract<Phase, { kind: "result" }>), testCase: undefined });
  }

  /* ---------------- rendering ---------------- */

  if (!permission) return <View style={{ flex: 1, backgroundColor: "#000" }} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg, padding: 20, gap: 16 }}>
        <T kind="title">Camera needed</T>
        <T>DoseWise uses the camera to read your medicine box and check your pill. Photos are processed on this phone and are not sent anywhere.</T>
        {permission.canAskAgain ? (
          <Button icon="camera" label="Allow camera" onPress={() => void requestPermission()} />
        ) : (
          <T muted>{"Camera access is turned off. You can turn it on in your phone's Settings for DoseWise."}</T>
        )}
        <Button variant="outline" label="Not now" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  if (phase.kind === "working") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg, alignItems: "center", justifyContent: "center", gap: 16 }}>
        <ActivityIndicator size="large" color={t.colors.primary} />
        <T kind="heading">Checking…</T>
      </SafeAreaView>
    );
  }

  if (phase.kind === "message") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg, padding: 20, gap: 16, justifyContent: "center" }}>
        <Ionicons name={phase.ok ? "checkmark-circle" : "alert-circle"} size={72} color={phase.ok ? t.colors.success : t.colors.warning} />
        <T kind="title" accessibilityRole="header">
          {phase.title}
        </T>
        <T>{phase.body}</T>
        {phase.ok ? (
          <Button label="Done" icon="checkmark" onPress={() => router.back()} />
        ) : (
          <>
            <Button label="Try again" icon="camera" onPress={() => setPhase({ kind: "camera" })} />
            <Button variant="outline" label="Cancel" onPress={() => router.back()} />
          </>
        )}
      </SafeAreaView>
    );
  }

  if (phase.kind === "result") {
    const { v, logged } = phase;
    const look =
      v.result === "match"
        ? { icon: "checkmark-circle" as const, color: t.colors.success, title: logged ? "Matches: logged as taken" : "Matches" }
        : v.result === "unsure"
          ? { icon: "help-circle" as const, color: t.colors.warning, title: "Couldn't check" }
          : { icon: "close-circle" as const, color: t.colors.danger, title: "Don't take this yet" };
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg, padding: 20, gap: 16, justifyContent: "center" }}>
        <Ionicons name={look.icon} size={80} color={look.color} accessibilityElementsHidden />
        <T kind="title" color={look.color} accessibilityRole="header" accessibilityLiveRegion="assertive">
          {look.title}
        </T>
        <T>{v.reason}</T>
        {phase.testCase && (
          <Card>
            <T bold>Tester mode: what was in the photo?</T>
            <Row wrap>
              <Chip label="Right medicine and strength" selected={false} onPress={() => labelTestCase("match")} />
              <Chip label="A different strength" selected={false} onPress={() => labelTestCase("different-strength")} />
            </Row>
          </Card>
        )}
        {v.result === "match" ? (
          <Button label="Done" icon="checkmark" onPress={() => router.back()} />
        ) : (
          <>
            <Button label="Take another photo" icon="camera" onPress={() => setPhase({ kind: "camera" })} />
            {params.doseKey && (
              <Button
                variant="outline"
                label={v.result === "unsure" ? "Log as taken without check" : "I checked: log as taken"}
                onPress={() => logAnyway(v)}
              />
            )}
            <Button variant="ghost" label="Close" onPress={() => router.back()} />
          </>
        )}
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        onBarcodeScanned={subject === "box" ? onBarcode : undefined}
      />
      <SafeAreaView style={{ flex: 1, justifyContent: "space-between" }}>
        <View style={{ padding: 16, gap: 8, backgroundColor: "rgba(0,0,0,0.65)" }}>
          <T kind="heading" color="#FFFFFF" accessibilityRole="header">
            {title}
          </T>
          <T color="#FFFFFF">{HELP[subject]}</T>
          {mode === "verify" && (
            <Row wrap>
              <Chip label="Photo of the box" selected={subject === "box"} onPress={() => setSubject("box")} />
              <Chip label="Photo of the pill" selected={subject === "pill"} onPress={() => setSubject("pill")} />
            </Row>
          )}
        </View>
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          style={{ alignSelf: "center", width: guide, height: guide, borderWidth: 4, borderColor: "#FFFFFF", borderRadius: 20 }}
        />
        <View style={{ padding: 20, gap: 12, alignItems: "center", backgroundColor: "rgba(0,0,0,0.65)" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            onPress={() => void capture()}
            style={({ pressed }) => ({
              width: 88,
              height: 88,
              borderRadius: 44,
              backgroundColor: "#FFFFFF",
              borderWidth: 6,
              borderColor: t.colors.primary,
              opacity: pressed ? 0.7 : 1,
            })}
          />
          <Row>
            {mode === "reference" && subject === "pill" && (
              <Button variant="outline" label="Skip pill photo" onPress={() => router.back()} />
            )}
            <Button variant="outline" label="Cancel" onPress={() => router.back()} />
          </Row>
        </View>
      </SafeAreaView>
    </View>
  );
}

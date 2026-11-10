/**
 * Family updates over WhatsApp (PRD R5–R7, consent flow in section 6).
 * Every step of sharing is the patient's choice, shown with the exact message
 * family members will receive, and can be stopped here at any time.
 */
import { maskPhone, normalisePhone, render } from "@dosewise/core";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Share, Switch, TextInput, View } from "react-native";
import { Button, Card, Row, Screen, T } from "@/components/ui";
import { ApiError, api, cloudConfigured, finishSignIn, signOut, startSignIn, useSignedIn, type PendingSignIn } from "@/lib/cloud";
import { syncFamily } from "@/lib/family";
import { setSetting, useSettings } from "@/lib/store";
import { TESTER_BUILD } from "@/lib/tester";
import { useTheme } from "@/lib/theme";

interface Profile {
  displayName?: string;
  phone?: string;
  includeMedicineNames?: boolean;
}
interface Caregiver {
  id: string;
  name: string;
  phone: string;
  status: "invited" | "active" | "declined" | "stopped";
  alerts: boolean;
  summary: boolean;
  channel: "whatsapp" | "sms";
}

const message = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong.");

function Input(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <T bold>{props.label}</T>
      <TextInput
        accessibilityLabel={props.label}
        placeholderTextColor={t.colors.muted}
        {...props}
        style={{ minHeight: t.size.target, fontSize: t.size.body, color: t.colors.text, borderWidth: 2, borderColor: t.colors.border, borderRadius: 12, paddingHorizontal: 14, backgroundColor: t.colors.card }}
      />
    </View>
  );
}

function SignIn() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<PendingSignIn | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = useTheme();

  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await f();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      <T kind="heading">Sign in with your phone number</T>
      <T muted>
        Family updates need a DoseWise account. Your medicines, history and photos stay on this phone. Only your dose times go
        online, and only while family updates are on.
      </T>
      {!pending ? (
        <>
          <Input label="Your mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="082 123 4567" autoComplete="tel" />
          <Button
            label="Send me a code"
            icon="chatbubble-ellipses"
            disabled={busy}
            onPress={() =>
              run(async () => {
                const e164 = normalisePhone(phone);
                if (!e164) throw new Error("Please check the number.");
                setPending(await startSignIn(e164));
              })
            }
          />
        </>
      ) : (
        <>
          <T>We sent a code by SMS to {maskPhone(pending.phone)}.</T>
          <Input label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" maxLength={8} />
          <Button label="Sign in" icon="log-in" disabled={busy || code.length < 6} onPress={() => run(() => finishSignIn(pending, code.trim()))} />
          <Button variant="ghost" label="Use a different number" onPress={() => setPending(null)} />
        </>
      )}
      {busy && <ActivityIndicator color={t.colors.primary} />}
      {error ? (
        <T bold color={t.colors.danger} accessibilityLiveRegion="polite">
          {error}
        </T>
      ) : null}
    </Card>
  );
}

function statusText(c: Caregiver) {
  const via = c.channel === "sms" ? " by SMS" : " on WhatsApp";
  if (c.status === "invited") return `Invited${via}: waiting for them to agree`;
  if (c.status === "declined") return "Said no thanks";
  if (c.status === "stopped") return "Stopped updates";
  const what = c.alerts && c.summary ? "alerts and a daily summary" : c.alerts ? "alerts" : "a daily summary";
  return `Gets ${what}${via}`;
}

/** The consent screen: exactly what will be shared, with whom, how to stop. */
function AddCaregiver({ displayName, noticeVersion, withNames, onDone }: { displayName: string; noticeVersion: string; withNames: boolean; onDone: () => void }) {
  const t = useTheme();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<"form" | "consent">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const e164 = normalisePhone(phone);

  const invite = async () => {
    setBusy(true);
    setError("");
    try {
      await api("POST", "/v1/caregivers", { name: name.trim(), phone: e164, agreed: true, noticeVersion });
      setSetting("familySharing", true);
      void syncFamily();
      onDone();
    } catch (e) {
      setError(message(e));
      setStep("form");
    } finally {
      setBusy(false);
    }
  };

  if (step === "form") {
    return (
      <Card style={{ gap: 12 }}>
        <T kind="heading">Add a family member</T>
        <Input label="Their name" value={name} onChangeText={setName} placeholder="e.g. Sipho" maxLength={60} />
        <Input label="Their mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="082 123 4567" />
        {error ? <T bold color={t.colors.danger}>{error}</T> : null}
        <Button label="Next" icon="arrow-forward" disabled={!name.trim() || !e164} onPress={() => setStep("consent")} />
      </Card>
    );
  }

  const sample = withNames
    ? render("dosewise_dose_not_confirmed_named", [displayName, "08:00", "Metformin 500 mg"])
    : render("dosewise_dose_not_confirmed", [displayName, "08:00"]);
  return (
    <Card style={{ gap: 12 }}>
      <T kind="heading">Before you share</T>
      <T>
        {name.trim()} ({maskPhone(e164!)}) will be asked on WhatsApp if they want updates about you. Nothing is sent until they agree.
      </T>
      <T bold>What they would see</T>
      <Card style={{ backgroundColor: t.colors.neutralBg }}>
        <T>{sample}</T>
      </Card>
      <T>{"• They choose alerts when a dose isn't confirmed, a daily summary, or both."}</T>
      <T>• They never see your photos or dose history{withNames ? "" : ", or the names of your medicines"}.</T>
      <T>• You can stop this here at any time. They can reply STOP.</T>
      <T>{"• WhatsApp is run by Meta, outside South Africa. If they don't use WhatsApp, the message is sent by SMS."}</T>
      <Button label="I agree, send the invite" icon="checkmark" disabled={busy} onPress={() => void invite()} />
      <Button variant="ghost" label="Back" onPress={() => setStep("form")} />
    </Card>
  );
}

interface OutboxMessage {
  id: string;
  channel: "whatsapp" | "sms";
  to: string;
  text: string;
  buttons: { text: string; payload: string }[];
  sentAt: string;
}

/**
 * Beta builds against a staging backend in test messaging mode: shows the messages family
 * members would have received, and lets the tester tap their buttons or reply STOP as them.
 * Hidden when the backend sends for real (the test routes then answer 404).
 */
function TestMessages() {
  const t = useTheme();
  const [messages, setMessages] = useState<OutboxMessage[] | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      setMessages((await api<{ messages: OutboxMessage[] }>("GET", "/v1/test/outbox")).messages);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMessages(null); // live backend: hide
      else setNote(message(e));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const reply = async (to: string, body: { payload?: string; text?: string }) => {
    try {
      setMessages((await api<{ messages: OutboxMessage[] }>("POST", "/v1/test/reply", { phone: to, ...body })).messages);
      setNote("Reply sent as the family member.");
    } catch (e) {
      setNote(message(e));
    }
  };

  const sweep = async () => {
    try {
      const r = await api<{ slots: number; sent: number }>("POST", "/v1/test/sweep");
      setNote(`Missed-dose check: ${r.sent} alert${r.sent === 1 ? "" : "s"} sent.`);
      await load();
    } catch (e) {
      setNote(message(e));
    }
  };

  if (messages === null) return null;
  return (
    <>
      <T kind="heading">Test messages</T>
      <T kind="small" muted>
        Test server: nothing is sent by WhatsApp or SMS. These are the messages family members would get. Tap a button to answer
        as them.
      </T>
      <Row wrap>
        <Button variant="outline" icon="refresh" label="Refresh" onPress={() => void load()} />
        <Button variant="outline" icon="alarm" label="Run missed-dose check" onPress={() => void sweep()} />
      </Row>
      {note ? <T kind="small" bold accessibilityLiveRegion="polite">{note}</T> : null}
      {messages.length === 0 && <T muted>No messages yet. Add a family member to send an invite.</T>}
      {messages.map((m) => (
        <Card key={m.id} style={{ backgroundColor: t.colors.neutralBg }}>
          <T kind="small" muted>
            To {maskPhone(m.to)} by {m.channel === "sms" ? "SMS" : "WhatsApp"} · {new Date(m.sentAt).toLocaleTimeString()}
          </T>
          <T>{m.text}</T>
          <Row wrap>
            {m.buttons.map((b) => (
              <Button key={b.payload} variant="outline" label={b.text} hint={`Answers as ${maskPhone(m.to)}`} onPress={() => void reply(m.to, { payload: b.payload })} />
            ))}
            <Button variant="ghost" label="Reply STOP" onPress={() => void reply(m.to, { text: "STOP" })} />
          </Row>
        </Card>
      ))}
    </>
  );
}

export default function Family() {
  const t = useTheme();
  const phone = useSignedIn();
  const settings = useSettings();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [noticeVersion, setNoticeVersion] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!phone) return;
    try {
      const [p, c] = await Promise.all([
        api<Profile>("GET", "/v1/me"),
        api<{ caregivers: Caregiver[]; noticeVersion: string }>("GET", "/v1/caregivers"),
      ]);
      setProfile(p);
      setDisplayName((d) => d || p.displayName || "");
      setCaregivers(c.caregivers);
      setNoticeVersion(c.noticeVersion);
      const anyActive = c.caregivers.some((x) => x.status === "invited" || x.status === "active");
      if (anyActive !== settings.familySharing) setSetting("familySharing", anyActive);
      setSetting("familyReviewedAt", Date.now());
      setError("");
    } catch (e) {
      setError(message(e));
    }
  }, [phone, settings.familySharing]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const saveProfile = async (patch: Partial<{ displayName: string; includeMedicineNames: boolean; sharePhoneWithFamily: boolean }>) => {
    try {
      const next = await api<Profile>("PUT", "/v1/me", {
        displayName: patch.displayName ?? profile?.displayName ?? displayName,
        includeMedicineNames: patch.includeMedicineNames ?? profile?.includeMedicineNames ?? false,
        sharePhoneWithFamily: patch.sharePhoneWithFamily ?? !!profile?.phone,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setProfile(next);
      setSetting("familyMedicineNames", !!next.includeMedicineNames);
      void syncFamily();
    } catch (e) {
      setError(message(e));
    }
  };

  const remove = (c: Caregiver) =>
    Alert.alert(`Stop updates to ${c.name}?`, "This takes effect straight away.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Stop updates",
        style: "destructive",
        onPress: () => void api("DELETE", `/v1/caregivers/${c.id}`).then(refresh, (e) => setError(message(e))),
      },
    ]);

  const deleteOnline = () =>
    Alert.alert("Delete your online account?", "Family updates stop and everything DoseWise holds online is deleted. Your medicines on this phone stay.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api("DELETE", "/v1/me");
            setSetting("familySharing", false);
            setSetting("familyMedicineNames", false);
            signOut();
          } catch (e) {
            setError(message(e));
          }
        },
      },
    ]);

  if (!cloudConfigured) {
    return (
      <Screen>
        <Card>
          <T>{"Family updates aren't available in this version of the app."}</T>
        </Card>
      </Screen>
    );
  }
  if (!phone) {
    return (
      <Screen>
        <SignIn />
      </Screen>
    );
  }

  const named = !!profile?.displayName;
  return (
    <Screen>
      <T kind="title" accessibilityRole="header">
        Family updates
      </T>
      <T muted>{"Let up to 5 people know on WhatsApp if you haven't confirmed a dose."}</T>
      {error ? <T bold color={t.colors.danger}>{error}</T> : null}

      <Card style={{ gap: 12 }}>
        <Input label="Your name, as family will see it" value={displayName} onChangeText={setDisplayName} placeholder="e.g. Thandi" maxLength={40} />
        <Button
          variant={named ? "outline" : "primary"}
          label="Save name"
          disabled={!displayName.trim() || displayName.trim() === profile?.displayName}
          onPress={() => void saveProfile({ displayName: displayName.trim() })}
        />
      </Card>

      {named && (
        <>
          <T kind="heading">People getting updates</T>
          {caregivers.length === 0 && <T muted>No one yet.</T>}
          {caregivers.map((c) => (
            <Card key={c.id}>
              <T kind="heading">{c.name}</T>
              <T muted>{c.phone}</T>
              <T>{statusText(c)}</T>
              {(c.status === "invited" || c.status === "active") && (
                <Row>
                  <Button variant="danger" icon="close" label="Stop updates" onPress={() => remove(c)} />
                </Row>
              )}
            </Card>
          ))}
          {adding ? (
            <AddCaregiver
              displayName={profile!.displayName!}
              noticeVersion={noticeVersion}
              withNames={!!profile?.includeMedicineNames}
              onDone={() => {
                setAdding(false);
                void refresh();
              }}
            />
          ) : (
            <Button icon="person-add" label="Add a family member" onPress={() => setAdding(true)} />
          )}

          <T kind="heading">What family can see</T>
          <Card>
            <Row style={{ justifyContent: "space-between" }}>
              <View style={{ flex: 1, gap: 2 }}>
                <T bold>Include medicine names</T>
                <T kind="small" muted>
                  Off: they see only the time, e.g. &quot;your 08:00 medication&quot;.
                </T>
              </View>
              <Switch
                accessibilityLabel="Include medicine names"
                value={!!profile?.includeMedicineNames}
                onValueChange={(v) => void saveProfile({ includeMedicineNames: v })}
                trackColor={{ true: t.colors.primary, false: t.colors.border }}
              />
            </Row>
          </Card>
          <Card>
            <Row style={{ justifyContent: "space-between" }}>
              <View style={{ flex: 1, gap: 2 }}>
                <T bold>Let them get my number</T>
                <T kind="small" muted>
                  If they reply CALL, they get {maskPhone(phone)} so they can phone you.
                </T>
              </View>
              <Switch
                accessibilityLabel="Let them get my number"
                value={!!profile?.phone}
                onValueChange={(v) => void saveProfile({ sharePhoneWithFamily: v })}
                trackColor={{ true: t.colors.primary, false: t.colors.border }}
              />
            </Row>
          </Card>
        </>
      )}

      {TESTER_BUILD && <TestMessages />}

      <T kind="heading">Your online data</T>
      <Button
        variant="outline"
        icon="download"
        label="Download my online data"
        onPress={() =>
          void api("GET", "/v1/me/export").then(
            (d) => Share.share({ title: "My DoseWise data", message: JSON.stringify(d, null, 1) }),
            (e) => setError(message(e)),
          )
        }
      />
      <Button variant="danger" icon="trash" label="Delete my online account" onPress={deleteOnline} />
      <Button variant="ghost" label={`Sign out (${maskPhone(phone)})`} onPress={signOut} />
    </Screen>
  );
}

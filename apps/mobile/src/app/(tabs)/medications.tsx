import { router } from "expo-router";
import { Alert, Image, View } from "react-native";
import { Button, Card, Row, Screen, T } from "@/components/ui";
import { deleteMedication, useMeds, useRefs } from "@/lib/store";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Medications() {
  const { meds } = useMeds();
  const refs = useRefs();

  const confirmDelete = (id: string, name: string) =>
    Alert.alert(`Delete ${name}?`, "Its reminders and history will be removed from this phone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMedication(id) },
    ]);

  return (
    <Screen>
      <T kind="title" accessibilityRole="header">
        Medicines
      </T>
      {meds.length === 0 && <T muted>No medicines yet.</T>}
      {meds.map((m) => (
        <Card key={m.id}>
          <View style={{ gap: 2 }}>
            <T kind="heading">{m.name}</T>
            <T muted>{[m.dosage, m.form, m.instructions].filter(Boolean).join(" · ")}</T>
            <T>
              {m.times.join(", ")} · {m.days.length ? m.days.map((d) => DAY_NAMES[d]).join(" ") : "Every day"}
            </T>
            {m.critical && <T bold>Critical: alarm if 30 minutes late</T>}
          </View>
          <Row>
            {refs[m.id]?.pillPhoto && (
              <Image
                source={{ uri: `data:image/jpeg;base64,${refs[m.id]!.pillPhoto}` }}
                accessibilityLabel={`Your ${m.name} pill`}
                style={{ width: 48, height: 48, borderRadius: 10 }}
              />
            )}
            <T kind="small" muted style={{ flex: 1 }}>
              {refs[m.id]
                ? `Photo check ready${refs[m.id]!.barcode ? " · barcode saved" : ""}${refs[m.id]!.pill ? " · pill photo saved" : ""}`
                : "Photo check not set up"}
            </T>
          </Row>
          <Row wrap>
            <Button
              variant="outline"
              icon="camera"
              label={refs[m.id] ? "Retake photos" : "Set up photo check"}
              onPress={() => router.push({ pathname: "/scan", params: { mode: "reference", medId: m.id } })}
            />
            <Button variant="danger" icon="trash" label="Delete" hint={`Deletes ${m.name}`} onPress={() => confirmDelete(m.id, m.name)} />
          </Row>
        </Card>
      ))}
      <Button icon="add" label="Add medicine" onPress={() => router.push("/add")} />
    </Screen>
  );
}

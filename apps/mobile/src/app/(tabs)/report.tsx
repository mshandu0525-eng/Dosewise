import { monthReport } from "@dosewise/core";
import { useState } from "react";
import { Text, View } from "react-native";
import { Button, Card, ProgressBar, Row, Screen, T } from "@/components/ui";
import { useMeds } from "@/lib/store";
import { useTheme } from "@/lib/theme";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function Report() {
  const t = useTheme();
  const state = useMeds();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const r = monthReport(state, cursor.y, cursor.m);
  const shift = (n: number) => {
    const d = new Date(cursor.y, cursor.m + n, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };
  const label = new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const firstWeekday = new Date(cursor.y, cursor.m, 1).getDay();
  const monthPrefix = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-`;
  const verified = Object.entries(state.logs).filter(
    ([key, log]) => log.status === "taken" && log.check?.result === "match" && key.split("|")[1]?.startsWith(monthPrefix),
  ).length;

  const tone = (scheduled: number, taken: number) => {
    if (!scheduled) return { bg: t.colors.neutralBg, fg: t.colors.muted, word: "nothing due" };
    if (taken === scheduled) return { bg: t.colors.successBg, fg: t.colors.success, word: "all taken" };
    if (taken > 0) return { bg: t.colors.warningBg, fg: t.colors.warning, word: `${taken} of ${scheduled} taken` };
    return { bg: t.colors.dangerBg, fg: t.colors.danger, word: "none taken" };
  };

  return (
    <Screen>
      <Row style={{ justifyContent: "space-between" }}>
        <Button variant="ghost" icon="chevron-back" iconOnly label="Previous month" onPress={() => shift(-1)} />
        <T kind="heading" accessibilityRole="header">
          {label}
        </T>
        <Button variant="ghost" icon="chevron-forward" iconOnly label="Next month" onPress={() => shift(1)} />
      </Row>

      <Card style={{ alignItems: "center" }}>
        <T muted>Adherence</T>
        <T kind="title" style={{ fontSize: t.size.title * 1.6, lineHeight: t.size.title * 1.9 }}>
          {r.adherence === null ? "—" : `${r.adherence}%`}
        </T>
        <T muted>
          {r.scheduled} {r.scheduled === 1 ? "dose" : "doses"} recorded this month
        </T>
        {r.taken > 0 && (
          <T kind="small" muted>
            {verified} of {r.taken} taken doses photo-verified
          </T>
        )}
      </Card>

      <Row>
        {(
          [
            ["Taken", r.taken, t.colors.success],
            ["Skipped", r.skipped, t.colors.muted],
            ["Missed", r.missed, t.colors.danger],
          ] as const
        ).map(([l, v, c]) => (
          <Card key={l} style={{ flex: 1, alignItems: "center" }}>
            <T kind="heading" color={c}>
              {v}
            </T>
            <T kind="small" muted>
              {l}
            </T>
          </Card>
        ))}
      </Row>

      <Card>
        <T bold>Daily view</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {WEEKDAYS.map((d, i) => (
            <Text key={`h${i}`} style={{ width: `${100 / 7}%`, textAlign: "center", color: t.colors.muted, fontSize: t.size.small }}>
              {d}
            </Text>
          ))}
          {Array.from({ length: firstWeekday }, (_, i) => (
            <View key={`e${i}`} style={{ width: `${100 / 7}%` }} />
          ))}
          {r.days.map((d) => {
            const c = tone(d.scheduled, d.taken);
            const day = Number(d.date.slice(8));
            return (
              <View key={d.date} style={{ width: `${100 / 7}%`, padding: 2 }} accessible accessibilityLabel={`Day ${day}: ${c.word}`}>
                <View style={{ aspectRatio: 1, borderRadius: 8, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: c.fg, fontWeight: "700", fontSize: t.size.small }}>{day}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </Card>

      {r.perMed.length > 0 && <T bold>By medicine</T>}
      {r.perMed.map((p) => (
        <Card key={p.med.id}>
          <Row style={{ justifyContent: "space-between" }}>
            <T bold>{p.med.name}</T>
            <T muted>
              {p.taken}/{p.total} · {p.adherence}%
            </T>
          </Row>
          <ProgressBar value={p.adherence ?? 0} label={`${p.med.name}: ${p.adherence}% taken`} />
        </Card>
      ))}
    </Screen>
  );
}

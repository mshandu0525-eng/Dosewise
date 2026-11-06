import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { monthReport, useMeds } from "@/lib/meds";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: "Monthly report · Dosewise" },
      { name: "description", content: "Your monthly medication adherence: doses taken, skipped and missed." },
      { property: "og:title", content: "Monthly report · Dosewise" },
      { property: "og:description", content: "Track monthly compliance per medication." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Report,
});

function Report() {
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

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft /></Button>
        <h1 className="font-display text-2xl">{label}</h1>
        <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => shift(1)}><ChevronRight /></Button>
      </div>

      <section className="mt-4 rounded-3xl bg-hero p-6 text-center text-primary-foreground shadow-soft">
        <p className="text-sm opacity-80">Adherence</p>
        <p className="font-display text-6xl">{r.adherence === null ? "—" : `${r.adherence}%`}</p>
        <p className="mt-1 text-sm opacity-80">{r.scheduled} {r.scheduled === 1 ? "dose" : "doses"} recorded this month</p>
      </section>

      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        {[
          ["Taken", r.taken, "text-success"],
          ["Skipped", r.skipped, "text-muted-foreground"],
          ["Missed", r.missed, "text-destructive"],
        ].map(([l, v, c]) => (
          <div key={l as string} className="rounded-2xl border border-border bg-card p-3">
            <p className={`font-display text-2xl ${c}`}>{v}</p>
            <p className="text-xs text-muted-foreground">{l}</p>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Daily view</h2>
        <div className="mt-3 grid grid-cols-7 gap-1.5 text-center text-[10px] text-muted-foreground">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={i}>{d}</span>)}
          {Array.from({ length: firstWeekday }).map((_, i) => <span key={`e${i}`} />)}
          {r.days.map((d) => {
            const ratio = d.scheduled ? d.taken / d.scheduled : -1;
            const tone = ratio < 0 ? "bg-muted" : ratio === 1 ? "bg-success text-success-foreground" : ratio > 0 ? "bg-warning" : "bg-destructive/70 text-destructive-foreground";
            return (
              <span key={d.date} title={`${d.taken}/${d.scheduled}`} className={`flex aspect-square items-center justify-center rounded-lg text-xs font-medium ${tone}`}>
                {Number(d.date.slice(8))}
              </span>
            );
          })}
        </div>
      </section>

      {r.perMed.length > 0 && (
        <section className="mt-6 space-y-3">
          <h2 className="text-sm font-semibold">By medication</h2>
          {r.perMed.map((p) => (
            <div key={p.med.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex justify-between text-sm">
                <span className="font-semibold">{p.med.name}</span>
                <span className="tabular-nums text-muted-foreground">{p.taken}/{p.total} · {p.adherence}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${p.adherence ?? 0}%` }} />
              </div>
            </div>
          ))}
        </section>
      )}
    </AppShell>
  );
}

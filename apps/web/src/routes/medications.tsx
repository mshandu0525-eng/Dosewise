import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { deleteMedication, useMeds } from "@/lib/meds";

export const Route = createFileRoute("/medications")({
  head: () => ({
    meta: [
      { title: "My medications · Dosewise" },
      { name: "description", content: "All your medications, doses and reminder schedules in one place." },
      { property: "og:title", content: "My medications · Dosewise" },
      { property: "og:description", content: "Manage medications and their reminder schedules." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Medications,
});

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Medications() {
  const { meds } = useMeds();
  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl">Medications</h1>
        <Button asChild size="sm" className="rounded-full">
          <Link to="/add"><Plus /> Add</Link>
        </Button>
      </div>
      {meds.length === 0 && <p className="mt-8 text-center text-sm text-muted-foreground">No medications yet.</p>}
      <ul className="mt-6 space-y-3">
        {meds.map((m) => (
          <li key={m.id} className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4">
            <div>
              <p className="font-display text-lg leading-tight">{m.name}</p>
              <p className="text-sm text-muted-foreground">{m.dosage} · {m.form}{m.instructions && ` · ${m.instructions}`}</p>
              <p className="mt-2 text-sm">
                {m.times.join(", ")} · {m.days.length ? m.days.map((d) => DAY_NAMES[d]).join(" ") : "Every day"}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${m.name}`}
              onClick={() => confirm(`Delete ${m.name}?`) && deleteMedication(m.id)}
            >
              <Trash2 className="text-destructive" />
            </Button>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}

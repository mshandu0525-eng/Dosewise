import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addMedication, dateKey } from "@/lib/meds";

export const Route = createFileRoute("/add")({
  head: () => ({
    meta: [
      { title: "Add medication · Dosewise" },
      { name: "description", content: "Add a medication with its dose, form and reminder schedule." },
      { property: "og:title", content: "Add medication · Dosewise" },
      { property: "og:description", content: "Set up drug name, dosage and custom reminder times." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AddMedication,
});

const FORMS = ["Tablet", "Capsule", "Liquid", "Injection", "Inhaler", "Drops", "Patch"];
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const PRESETS: Record<string, string[]> = {
  "Once daily": ["08:00"],
  "Twice daily": ["08:00", "20:00"],
  "3× daily": ["08:00", "14:00", "20:00"],
};

const chip = "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors";
const chipOn = "border-primary bg-primary text-primary-foreground";
const chipOff = "border-border bg-card text-foreground";

function AddMedication() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [form, setForm] = useState("Tablet");
  const [instructions, setInstructions] = useState("");
  const [times, setTimes] = useState<string[]>(["08:00"]);
  const [everyDay, setEveryDay] = useState(true);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startDate, setStartDate] = useState(() => dateKey(new Date()));
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTimes = [...new Set(times.filter(Boolean))].sort();
    if (!name.trim() || !dosage.trim()) return setError("Please enter the medication name and dose.");
    if (!cleanTimes.length) return setError("Add at least one reminder time.");
    if (!everyDay && !days.length) return setError("Pick at least one day.");
    addMedication({
      name: name.trim(),
      dosage: dosage.trim(),
      form,
      instructions: instructions.trim(),
      times: cleanTimes,
      days: everyDay ? [] : [...days].sort(),
      startDate,
    });
    navigate({ to: "/" });
  };

  return (
    <AppShell>
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" /> Back
      </Link>
      <h1 className="mt-3 font-display text-3xl">New medication</h1>

      <form onSubmit={submit} className="mt-6 space-y-6">
        <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Medication name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Metformin" maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dosage">Dose</Label>
            <Input id="dosage" value={dosage} onChange={(e) => setDosage(e.target.value)} placeholder="e.g. 500 mg or 1 tablet" maxLength={40} />
          </div>
          <div className="space-y-2">
            <Label>Form</Label>
            <div className="flex flex-wrap gap-2">
              {FORMS.map((f) => (
                <button type="button" key={f} onClick={() => setForm(f)} className={`${chip} ${form === f ? chipOn : chipOff}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="instr">Instructions (optional)</Label>
            <Input id="instr" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. With food" maxLength={80} />
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <div className="space-y-2">
            <Label>How often</Label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(PRESETS).map(([label, t]) => (
                <button type="button" key={label} onClick={() => setTimes(t)} className={`${chip} ${times.join() === t.join() ? chipOn : chipOff}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Reminder times</Label>
            {times.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input type="time" value={t} onChange={(e) => setTimes(times.map((x, j) => (j === i ? e.target.value : x)))} />
                {times.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove time" onClick={() => setTimes(times.filter((_, j) => j !== i))}>
                    <X />
                  </Button>
                )}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setTimes([...times, "12:00"])}>
              <Plus /> Add time
            </Button>
          </div>
          <div className="space-y-2">
            <Label>Days</Label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEveryDay(true)} className={`${chip} ${everyDay ? chipOn : chipOff}`}>Every day</button>
              <button type="button" onClick={() => setEveryDay(false)} className={`${chip} ${!everyDay ? chipOn : chipOff}`}>Specific days</button>
            </div>
            {!everyDay && (
              <div className="flex justify-between pt-1">
                {DAYS.map((d, i) => {
                  const on = days.includes(i);
                  return (
                    <button
                      type="button"
                      key={i}
                      aria-pressed={on}
                      onClick={() => setDays(on ? days.filter((x) => x !== i) : [...days, i])}
                      className={`size-10 rounded-full border text-sm font-semibold ${on ? chipOn : chipOff}`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="start">Start date</Label>
            <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Times follow your phone's local time, so reminders adjust automatically when you travel.
          </p>
        </section>

        {error && <p className="text-sm font-medium text-destructive">{error}</p>}
        <Button type="submit" size="lg" className="w-full rounded-full">Save medication</Button>
      </form>
    </AppShell>
  );
}

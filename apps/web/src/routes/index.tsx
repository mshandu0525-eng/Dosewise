import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, Check, Plus, SkipForward, Undo2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { dateKey, dosesForDate, logDose, useMeds, type Dose } from "@/lib/meds";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Today's doses · Dosewise" },
      { name: "description", content: "See today's medication schedule and mark each dose as taken or skipped." },
      { property: "og:title", content: "Today's doses · Dosewise" },
      { property: "og:description", content: "A calm, private medication reminder and adherence tracker." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Today,
});

const statusStyle: Record<Dose["status"], string> = {
  taken: "bg-success/15 text-success",
  skipped: "bg-muted text-muted-foreground",
  missed: "bg-destructive/15 text-destructive",
  due: "bg-warning/25 text-accent-foreground",
  upcoming: "bg-secondary text-secondary-foreground",
};

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function NotifyButton() {
  const [perm, setPerm] = useState<string>("default");
  useEffect(() => setPerm("Notification" in window ? Notification.permission : "unsupported"), []);
  if (perm === "granted" || perm === "unsupported") return null;
  const inFrame = typeof window !== "undefined" && window.top !== window.self;
  return (
    <button
      onClick={async () => {
        if (inFrame) return alert("Open the app in its own tab to allow notifications.");
        setPerm(await Notification.requestPermission());
      }}
      className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left text-sm"
    >
      <Bell className="size-5 text-primary" />
      <span>
        <span className="font-semibold">Turn on reminders</span>
        <span className="block text-muted-foreground">
          {perm === "denied" ? "Notifications are blocked in your browser settings." : "Get an alert when a dose is due."}
        </span>
      </span>
    </button>
  );
}

function Today() {
  const state = useMeds();
  const now = useNow();
  const doses = dosesForDate(state, dateKey(now), now);
  const done = doses.filter((d) => d.status === "taken").length;
  const progress = doses.length ? (done / doses.length) * 100 : 0;

  return (
    <AppShell>
      <header className="rounded-3xl bg-hero p-6 text-primary-foreground shadow-soft">
        <p className="text-sm opacity-80">{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
        <h1 className="mt-1 font-display text-3xl">
          {doses.length ? `${done} of ${doses.length} doses taken` : "Nothing scheduled"}
        </h1>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-primary-foreground/20">
          <div className="h-full rounded-full bg-primary-foreground transition-all" style={{ width: `${progress}%` }} />
        </div>
      </header>

      <NotifyButton />

      {state.meds.length === 0 ? (
        <div className="mt-10 text-center">
          <p className="font-display text-xl">Add your first medication</p>
          <p className="mt-1 text-sm text-muted-foreground">Set the dose and times, and we'll remind you.</p>
          <Button asChild className="mt-5 rounded-full" size="lg">
            <Link to="/add"><Plus /> Add medication</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {doses.map((d) => {
            const open = d.status !== "taken" && d.status !== "skipped";
            return (
              <li key={d.key} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold tabular-nums text-muted-foreground">{d.time}</p>
                    <p className="font-display text-lg leading-tight">{d.med.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {d.med.dosage} · {d.med.form}
                      {d.med.instructions && ` · ${d.med.instructions}`}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusStyle[d.status]}`}>
                    {d.status}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  {open ? (
                    <>
                      <Button className="flex-1 rounded-full" onClick={() => logDose(d.key, "taken")}>
                        <Check /> Taken
                      </Button>
                      <Button variant="outline" className="flex-1 rounded-full" onClick={() => logDose(d.key, "skipped")}>
                        <SkipForward /> Skip
                      </Button>
                    </>
                  ) : (
                    <Button variant="ghost" size="sm" className="rounded-full" onClick={() => logDose(d.key, null)}>
                      <Undo2 /> Undo
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
          {doses.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No doses scheduled for today.</p>
          )}
        </ul>
      )}

      {state.meds.length > 0 && (
        <Button asChild size="icon" className="fixed bottom-20 right-[max(1.25rem,calc(50%-12rem))] z-30 size-14 rounded-full shadow-soft">
          <Link to="/add" aria-label="Add medication"><Plus className="!size-6" /></Link>
        </Button>
      )}
    </AppShell>
  );
}

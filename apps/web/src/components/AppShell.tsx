import { Link } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { CalendarCheck, Pill, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { dateKey, dosesForDate, getState } from "@/lib/meds";

const nav = [
  { to: "/", label: "Today", icon: CalendarCheck },
  { to: "/medications", label: "Medications", icon: Pill },
  { to: "/report", label: "Report", icon: BarChart3 },
] as const;

/** Checks every 30s for doses that just became due and alerts once per dose. */
function useReminders() {
  useEffect(() => {
    const notified = new Set<string>(JSON.parse(sessionStorage.getItem("dw.notified") ?? "[]"));
    const check = () => {
      const due = dosesForDate(getState(), dateKey(new Date())).filter(
        (d) => d.status === "due" && !notified.has(d.key),
      );
      for (const d of due) {
        notified.add(d.key);
        const body = `${d.med.dosage} ${d.med.form.toLowerCase()} · ${d.time}`;
        toast(`Time for ${d.med.name}`, { description: body });
        if ("Notification" in window && Notification.permission === "granted") {
          try {
            new Notification(`Time for ${d.med.name}`, { body, tag: d.key });
          } catch {
            /* some browsers only allow notifications from a service worker */
          }
        }
      }
      sessionStorage.setItem("dw.notified", JSON.stringify([...notified]));
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, []);
}

export function AppShell({ children }: { children: ReactNode }) {
  useReminders();
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background">
      <main className="flex-1 px-5 pb-28 pt-6">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-border bg-card/95 backdrop-blur">
        <ul className="grid grid-cols-3">
          {nav.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                activeOptions={{ exact: true }}
                className="flex flex-col items-center gap-1 py-3 text-xs font-medium text-muted-foreground transition-colors data-[status=active]:text-primary"
              >
                <Icon className="size-5" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

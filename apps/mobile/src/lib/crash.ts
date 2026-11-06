/**
 * Crash reporting (Sentry), off unless the person agrees: on by default only in
 * beta builds, where it's part of the beta consent; opt-in in store builds.
 *
 * Every report goes through scrubEvent/scrubBreadcrumb from @dosewise/core, and the
 * Sentry features that could capture on-screen text are switched off:
 * screenshots, view hierarchy, touch breadcrumbs (no Sentry.wrap), network
 * capture, performance tracing and default PII. No user id is ever set.
 */
import { scrubBreadcrumb, scrubEvent, type CrashEvent } from "@dosewise/core";
import * as Sentry from "@sentry/react-native";
import { getSettings } from "./store";
import { TESTER_BUILD } from "./tester";

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";

/** False in builds without a Sentry DSN: the setting is hidden and nothing is sent. */
export const crashReportingAvailable = /^https:\/\/[^@]+@/.test(DSN);

let started = false;

/** Integrations that capture screen content or network traffic. */
const BLOCKED_INTEGRATIONS = new Set(["Screenshot", "ViewHierarchy", "HttpClient", "MobileReplay", "Spotlight"]);

export function startCrashReporting() {
  if (started || !crashReportingAvailable || !getSettings().crashReports) return;
  started = true;
  Sentry.init({
    dsn: DSN,
    environment: TESTER_BUILD ? "beta" : "production",
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    reportAccessibilityIdentifier: false,
    enableCaptureFailedRequests: false,
    enableAutoPerformanceTracing: false,
    enableUserInteractionTracing: false,
    tracesSampleRate: 0,
    // Sessions give the crash-free rate the beta measures; they carry no user id.
    enableAutoSessionTracking: true,
    maxBreadcrumbs: 30,
    integrations: (defaults) => defaults.filter((i) => !BLOCKED_INTEGRATIONS.has(i.name)),
    // Checked again at send time, so turning reports off stops JS reports straight away.
    // scrubEvent only removes or redacts fields, so the result is still a valid Sentry event.
    beforeSend: (event) => (getSettings().crashReports ? (scrubEvent(event as unknown as CrashEvent) as unknown as typeof event) : null),
    beforeBreadcrumb: (b) => scrubBreadcrumb(b),
  });
}

/** Turning reports off also stops native crash capture; turning on starts it now. */
export async function setCrashReporting(on: boolean) {
  if (on) startCrashReporting();
  else if (started) {
    started = false;
    await Sentry.close();
  }
}

export function reportError(error: unknown) {
  if (started) Sentry.captureException(error);
}

/** Started as early as possible (from index.ts) so crashes during start-up are caught. */
export function startCrashReportingSafely() {
  try {
    startCrashReporting();
  } catch {
    // If settings can't be read (e.g. the database won't open), don't report: we can't confirm consent.
  }
}

/** Tester mode only: proves reports reach Sentry from a real phone. Returns false if reports are off. */
export function sendTestCrashReport(): boolean {
  if (!started) return false;
  Sentry.captureException(new Error("DoseWise test crash report (tester mode)"));
  return true;
}

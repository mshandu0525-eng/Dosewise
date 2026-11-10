/**
 * Crash-report scrubbing. Every crash report passes through here before it
 * leaves the phone. The rule is "allow known-safe, drop the rest": a crash
 * report needs the error type, stack trace, app version and phone model, and
 * nothing about the person or their medicines.
 *
 * Plain object shapes (not Sentry's types) so it can be unit-tested here.
 */

export interface CrashBreadcrumb {
  type?: string;
  category?: string;
  message?: string;
  level?: string;
  data?: Record<string, unknown>;
  timestamp?: number;
}

export interface CrashEvent {
  message?: string | { formatted?: string; message?: string };
  exception?: { values?: { type?: string; value?: string; [k: string]: unknown }[] };
  breadcrumbs?: CrashBreadcrumb[];
  contexts?: Record<string, Record<string, unknown> | undefined>;
  tags?: Record<string, unknown>;
  [k: string]: unknown;
}

/** Breadcrumb categories that describe what the app did, not what the person typed or saw. */
const SAFE_CATEGORIES = new Set(["navigation", "app.lifecycle", "app.state", "device.event", "device.orientation", "sentry.event", "sentry.transaction"]);

/** Fields of the default contexts that are safe: versions and hardware, never names. */
const SAFE_CONTEXT_KEYS: Record<string, string[]> = {
  app: ["app_version", "app_build", "app_identifier", "app_start_time", "in_foreground", "app_memory"],
  os: ["name", "version", "build", "kernel_version", "rooted"],
  device: ["family", "model", "model_id", "arch", "manufacturer", "brand", "simulator", "memory_size", "free_memory", "low_memory", "battery_level", "charging", "orientation", "screen_density", "screen_height_pixels", "screen_width_pixels", "processor_count"],
  react_native_context: ["js_engine", "turbo_module", "fabric", "expo", "hermes_version", "react_native_version"],
  trace: ["trace_id", "span_id"],
};

const SAFE_TAGS = new Set(["environment", "release", "dist", "event.origin", "event.environment", "hermes"]);

/**
 * Removes anything that could identify a person or describe their health from free text:
 * quoted strings, email addresses, phone-like numbers, long digit runs (barcodes, ids),
 * doses ("500 mg") and URL query strings.
 */
export function redactText(s: string): string {
  return s
    .replace(/(["'`“‘])(?:(?!\1).){1,200}\1/g, "$1…$1")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\+?\d[\d\s-]{6,}\d/g, "[number]")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|ug|g|ml|iu|units|%)(?![a-z])/gi, "[dose]")
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/g, "$1")
    .replace(/([/\w-]+)\?[^\s]*/g, "$1")
    .slice(0, 500);
}

/** Navigation breadcrumbs keep only route paths (no query params, which hold ids). Everything else is dropped. */
export function scrubBreadcrumb<B extends CrashBreadcrumb>(b: B): B | null {
  if (!b.category || !SAFE_CATEGORIES.has(b.category)) return null;
  const data: Record<string, unknown> = {};
  for (const key of ["from", "to", "state", "screen"]) {
    const v = b.data?.[key];
    if (typeof v === "string") data[key] = v.split(/[?#]/)[0];
  }
  return { type: b.type, category: b.category, level: b.level, timestamp: b.timestamp, message: b.message ? redactText(b.message) : undefined, data } as B;
}

function pick(obj: Record<string, unknown> | undefined, keys: string[]) {
  if (!obj) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

export function scrubEvent<E extends CrashEvent>(e: E): E {
  const out: CrashEvent = { ...e };
  // No user, request, free-form extras, machine name, or attachments-by-reference.
  for (const k of ["user", "request", "extra", "server_name", "modules", "sdkProcessingMetadata"]) delete out[k];
  if (typeof out.message === "string") out.message = redactText(out.message);
  else if (out.message) out.message = { formatted: redactText(out.message.formatted ?? out.message.message ?? "") };
  if (out.exception?.values) {
    out.exception = { ...out.exception, values: out.exception.values.map((v) => ({ ...v, value: v.value ? redactText(v.value) : v.value })) };
  }
  if (out.contexts) {
    const contexts: Record<string, Record<string, unknown> | undefined> = {};
    for (const [name, keys] of Object.entries(SAFE_CONTEXT_KEYS)) {
      const c = pick(out.contexts[name], keys);
      if (c && Object.keys(c).length) contexts[name] = c;
    }
    out.contexts = contexts;
  }
  if (out.tags) out.tags = Object.fromEntries(Object.entries(out.tags).filter(([k]) => SAFE_TAGS.has(k)));
  if (out.breadcrumbs) out.breadcrumbs = out.breadcrumbs.map(scrubBreadcrumb).filter((b): b is CrashBreadcrumb => b !== null);
  return out as E;
}

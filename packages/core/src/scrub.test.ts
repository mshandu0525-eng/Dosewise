import { describe, expect, it } from "vitest";
import { redactText, scrubBreadcrumb, scrubEvent, type CrashEvent } from "./scrub";

describe("redactText", () => {
  it.each([
    ['Cannot read "Metformin 500 mg" of undefined', 'Cannot read "…" of undefined'],
    ["Failed for thandi@example.com", "Failed for [email]"],
    ["Invite to +27 82 555 0101 failed", "Invite to [number] failed"],
    ["barcode 06001234567897 not found", "barcode [number] not found"],
    ["Strength 500mg did not parse", "Strength [dose] did not parse"],
    ["GET https://api.dosewise.example/v1/slots?from=1 failed", "GET https://api.dosewise.example/v1/slots failed"],
    ["Navigate to /scan?medId=abc&doseKey=x", "Navigate to /scan"],
  ])("%s", (input, out) => expect(redactText(input)).toBe(out));

  it("keeps ordinary error text readable", () => {
    expect(redactText("TypeError: undefined is not a function")).toBe("TypeError: undefined is not a function");
  });
});

describe("scrubBreadcrumb", () => {
  it("drops touch, console and network breadcrumbs, which can hold on-screen text", () => {
    expect(scrubBreadcrumb({ category: "touch", message: "Touch event within element: Marks Metformin as taken" })).toBeNull();
    expect(scrubBreadcrumb({ category: "console", message: "Family sync failed" })).toBeNull();
    expect(scrubBreadcrumb({ category: "fetch", data: { url: "https://x/v1/caregivers" } })).toBeNull();
    expect(scrubBreadcrumb({ message: "no category" })).toBeNull();
  });

  it("keeps navigation with route paths only", () => {
    const b = scrubBreadcrumb({ category: "navigation", data: { from: "/", to: "/scan?mode=verify&medId=123", params: { medId: "123" } } });
    expect(b?.data).toEqual({ from: "/", to: "/scan" });
  });
});

describe("scrubEvent", () => {
  const event: CrashEvent = {
    message: "Crash after logging 'Amlodipine 5 mg'",
    exception: { values: [{ type: "Error", value: 'Bad label "Warfarin 5 mg"', stacktrace: { frames: [{ function: "verify" }] } }] },
    user: { id: "u1", ip_address: "{{auto}}" },
    request: { url: "https://x" },
    extra: { medicines: ["Metformin"] },
    server_name: "Thandi's iPhone",
    tags: { environment: "beta", release: "1.0.0", screen: "Metformin details" },
    contexts: {
      device: { model: "SM-A546E", manufacturer: "samsung", name: "Thandi's Galaxy" },
      os: { name: "Android", version: "15" },
      app: { app_version: "1.0.0", device_app_hash: "abc" },
      culture: { locale: "en-ZA", timezone: "Africa/Johannesburg" },
      state: { state: { medicines: "everything" } },
    },
    breadcrumbs: [
      { category: "touch", message: "Taken: Metformin" },
      { category: "navigation", data: { from: "/", to: "/family" } },
    ],
  };

  it("removes the person, free-form data and anything not on the allow-list", () => {
    const s = scrubEvent(event);
    expect(s).not.toHaveProperty("user");
    expect(s).not.toHaveProperty("request");
    expect(s).not.toHaveProperty("extra");
    expect(s).not.toHaveProperty("server_name");
    expect(s.contexts).toEqual({
      device: { model: "SM-A546E", manufacturer: "samsung" },
      os: { name: "Android", version: "15" },
      app: { app_version: "1.0.0" },
    });
    expect(s.tags).toEqual({ environment: "beta", release: "1.0.0" });
    expect(s.breadcrumbs).toEqual([{ category: "navigation", data: { from: "/", to: "/family" } }]);
  });

  it("keeps what's needed to fix the crash: type, stack, redacted message", () => {
    const s = scrubEvent(event);
    expect(s.exception?.values?.[0]).toMatchObject({ type: "Error", value: 'Bad label "…"', stacktrace: { frames: [{ function: "verify" }] } });
    expect(s.message).toBe("Crash after logging '…'");
  });

  it("leaves no medicine name, person's name or number anywhere", () => {
    expect(JSON.stringify(scrubEvent(event))).not.toMatch(/Metformin|Amlodipine|Warfarin|Thandi|5 mg|ip_address/);
  });
});

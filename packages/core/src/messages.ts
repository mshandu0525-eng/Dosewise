/**
 * WhatsApp message templates (utility category). Meta must approve each template
 * before it can be sent outside the 24-hour reply window; `npm run templates`
 * prints them in the format the WhatsApp Manager / API expects.
 *
 * Privacy rules for every template:
 * - No medicine names, conditions or photos, except the opt-in "_named" variant.
 * - The patient is named by the display name they chose (usually a first name).
 * - Every message says how to stop.
 */

export type TemplateName =
  | "dosewise_caregiver_invite"
  | "dosewise_dose_not_confirmed"
  | "dosewise_dose_not_confirmed_named"
  | "dosewise_daily_summary"
  | "dosewise_sharing_stopped";

export interface TemplateDef {
  name: TemplateName;
  category: "UTILITY";
  language: "en";
  /** Body with {{1}}…{{n}} placeholders. */
  body: string;
  /** Example values Meta requires for review. */
  example: string[];
  /** Quick-reply buttons; the payload sent with each carries the caregiver id. */
  buttons?: { text: string; action: ReplyAction }[];
  /** Text for SMS, where buttons don't exist. */
  smsSuffix: string;
}

export type ReplyAction = "ALERTS" | "SUMMARY" | "BOTH" | "NO" | "STOP" | "CALL";

const STOP_LINE = "Reply STOP to stop these updates.";

export const TEMPLATES: Record<TemplateName, TemplateDef> = {
  dosewise_caregiver_invite: {
    name: "dosewise_caregiver_invite",
    category: "UTILITY",
    language: "en",
    body:
      "DoseWise: {{1}} has asked us to keep you updated about their medication. " +
      "You can get an alert when a dose is not confirmed, a daily summary, or both. " +
      "DoseWise will never share medical details without {{1}}'s permission. Choose an option below to agree, or ignore this message.",
    example: ["Thandi"],
    buttons: [
      { text: "Alerts", action: "ALERTS" },
      { text: "Daily summary", action: "SUMMARY" },
      { text: "Both", action: "BOTH" },
      { text: "No thanks", action: "NO" },
    ],
    smsSuffix: "Reply ALERTS, SUMMARY or BOTH to agree, or NO.",
  },
  dosewise_dose_not_confirmed: {
    name: "dosewise_dose_not_confirmed",
    category: "UTILITY",
    language: "en",
    body: "DoseWise: {{1}} has not yet confirmed their {{2}} medication. " + STOP_LINE,
    example: ["Thandi", "08:00"],
    buttons: [{ text: "Call them", action: "CALL" }, { text: "Stop updates", action: "STOP" }],
    smsSuffix: "Reply CALL for their number.",
  },
  dosewise_dose_not_confirmed_named: {
    name: "dosewise_dose_not_confirmed_named",
    category: "UTILITY",
    language: "en",
    body: "DoseWise: {{1}} has not yet confirmed their {{2}} medication ({{3}}). " + STOP_LINE,
    example: ["Thandi", "08:00", "Metformin 500 mg"],
    buttons: [{ text: "Call them", action: "CALL" }, { text: "Stop updates", action: "STOP" }],
    smsSuffix: "Reply CALL for their number.",
  },
  dosewise_daily_summary: {
    name: "dosewise_daily_summary",
    category: "UTILITY",
    language: "en",
    body: "DoseWise daily summary for {{1}}: {{2}} of {{3}} doses confirmed today. {{4}} " + STOP_LINE,
    example: ["Thandi", "3", "4", "Not confirmed: 14:00."],
    buttons: [{ text: "Stop updates", action: "STOP" }],
    smsSuffix: "",
  },
  dosewise_sharing_stopped: {
    name: "dosewise_sharing_stopped",
    category: "UTILITY",
    language: "en",
    body: "You will no longer receive DoseWise updates about {{1}}. No further messages will be sent.",
    example: ["Thandi"],
    smsSuffix: "",
  },
};

export function render(name: TemplateName, params: string[]): string {
  return TEMPLATES[name].body.replace(/\{\{(\d+)\}\}/g, (_m, n: string) => params[Number(n) - 1] ?? "").replace(/\s+/g, " ").trim();
}

/** Text for an SMS version of a template. */
export function renderSms(name: TemplateName, params: string[]): string {
  const t = TEMPLATES[name];
  return [render(name, params), t.smsSuffix].filter(Boolean).join(" ");
}

/** Template definitions in Meta's "create message template" API shape, for submission. */
export function metaSubmission() {
  return Object.values(TEMPLATES).map((t) => ({
    name: t.name,
    category: t.category,
    language: t.language,
    components: [
      { type: "BODY", text: t.body, example: { body_text: [t.example] } },
      ...(t.buttons ? [{ type: "BUTTONS", buttons: t.buttons.map((b) => ({ type: "QUICK_REPLY", text: b.text })) }] : []),
    ],
  }));
}

/** Parses a reply: a button payload "ACTION:caregiverId", or free text from WhatsApp/SMS. */
export function parseReply(input: { payload?: string; text?: string }): { action: ReplyAction | "HELP"; caregiverId?: string } {
  if (input.payload) {
    const [action, caregiverId] = input.payload.split(":");
    if (["ALERTS", "SUMMARY", "BOTH", "NO", "STOP", "CALL"].includes(action ?? "")) return { action: action as ReplyAction, caregiverId };
  }
  const word = (input.text ?? "").trim().toUpperCase().replace(/[^A-Z ]/g, "").split(/\s+/)[0] ?? "";
  const map: Record<string, ReplyAction> = {
    ALERTS: "ALERTS", ALERT: "ALERTS", YES: "BOTH", SUMMARY: "SUMMARY", DAILY: "SUMMARY", BOTH: "BOTH",
    NO: "NO", STOP: "STOP", UNSUBSCRIBE: "STOP", CANCEL: "STOP", END: "STOP", QUIT: "STOP", CALL: "CALL",
  };
  return { action: map[word] ?? "HELP" };
}

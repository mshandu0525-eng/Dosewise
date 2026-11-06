/**
 * Replies to SMS (for caregivers not on WhatsApp). AWS End User Messaging delivers
 * two-way SMS to an SNS topic, which invokes this function.
 */
import type { SNSEvent } from "aws-lambda";
import { handleReply } from "../domain/caregivers";
import { getDeps } from "./runtime";

export const handler = async (event: SNSEvent) => {
  const deps = await getDeps();
  for (const record of event.Records) {
    const m = JSON.parse(record.Sns.Message) as { originationNumber?: string; messageBody?: string };
    if (m.originationNumber && m.messageBody) await handleReply(deps, { from: m.originationNumber, text: m.messageBody }, "sms");
  }
};

import { App } from "aws-cdk-lib";
import { DoseWiseStack } from "../lib/dosewise-stack";

const app = new App();
const stage = (app.node.tryGetContext("stage") as "prod" | "staging" | undefined) ?? "staging";

new DoseWiseStack(app, `DoseWise-${stage}`, {
  stage,
  // af-south-1 (Cape Town) keeps South African patients' data in South Africa.
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "af-south-1" },
  whatsappPhoneNumberId: (app.node.tryGetContext("whatsappPhoneNumberId") as string | undefined) ?? "SET_ME",
  // Staging defaults to the test outbox until the WhatsApp templates are approved.
  messagingMode: (app.node.tryGetContext("messagingMode") as "live" | "test" | undefined) ?? (stage === "prod" ? "live" : "test"),
  smsSenderId: app.node.tryGetContext("smsSenderId") as string | undefined,
  tags: { app: "dosewise", stage, "data-classification": "health" },
});

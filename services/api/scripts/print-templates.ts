// Prints the WhatsApp templates in the shape Meta's "create message template" API expects.
import { metaSubmission } from "@dosewise/core";

console.log(JSON.stringify(metaSubmission(), null, 2));

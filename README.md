# DoseWise

Medication reminders that use the phone's own alarm system, work offline, and keep health data on the device.

| Path | What it is |
| --- | --- |
| `packages/core` | Shared rules in TypeScript: dose status, monthly adherence, the reminder plan, and photo verification (label reading, barcode, pill fingerprint, decision rules, accuracy harness). Has tests. |
| `apps/mobile` | Expo app (SDK 58, Expo Router) for iOS and Android. |
| `services/api` | Backend: AWS Lambda functions in TypeScript (HTTP API, WhatsApp webhook, SMS replies, scheduled jobs) and the PostgreSQL schema. |
| `infra` | AWS CDK stack for af-south-1 (Cape Town). |
| `apps/web` | The original web prototype, kept for reference. Not part of the npm workspace. |

## Run it

```bash
npm install          # from the repo root (npm 11+; npm 10 has an install bug with this tree)
npm test             # core, API and infrastructure tests
cd apps/mobile
npx eas-cli@latest build --profile development --platform android   # or ios
npx expo start --dev-client
```

Expo Go is **not** enough. The app uses SQLCipher, time-sensitive notifications and a background task, which need a development build.

## Phase 1 (foundation): what is built

- **Encrypted storage.** SQLite with SQLCipher. A random 256-bit key is held in Keychain / Keystore as "this device only, after first unlock". See `apps/mobile/src/lib/db.ts`.
- **Local reminder ladder.** Due → nudge at +10 min (Time Sensitive on iOS) → alarm at +30 min for critical medicines (Android `setAlarmClock`, alarm channel that bypasses Do Not Disturb). Medicines due at the same time share one notification. Reminders stop once a dose is logged. The 48-hour rolling window is capped at 60 notifications, under the iOS limit of 64. See `packages/core/src/reminders.ts` and `apps/mobile/src/lib/reminders.ts`.
- **Log from the notification.** The Taken / Snooze 10 min / Skip buttons log the dose. On Android this happens without opening the app (a headless background task). On iOS the buttons open the app briefly, because iOS doesn't wake a closed app for a button press.
- **Easy View.** 22 pt+ text, 64 dp touch targets, AAA contrast, a "Take now" card, two tabs, and spoken confirmations.
- **Privacy.** An option hides medicine names on the lock screen, Android backups are off, and unneeded permissions (microphone, storage) are blocked.

## Phase 2 (photo verification): what is built

Everything runs on the phone. Photos never leave the device. Label text leaves it only if a tester exports it from tester mode, which store builds don't have.

- **Scan to fill.** "Scan the box" on the Add screen reads the name and strength from the label. The person confirms them.
- **Reference at setup.** One photo of the box (label text, strengths, barcode) and one photo of a pill (a colour-and-shape fingerprint). Only small thumbnails are kept, inside the encrypted database. The pill thumbnail appears on each dose card.
- **Check at dose time.** "Check with camera" on a dose: photograph the box or the pill.
  - **Matches:** logged as taken and marked photo-verified.
  - **Different strength / different medicine / different pill:** a red warning telling the person to check with their pharmacist.
  - **Couldn't check:** try again, or log the dose unverified.
  - The check never blocks logging. Dose-time photos are deleted as soon as they're processed.
- **How the decision works** (`packages/core/src/verify.ts`):
  1. A wrong strength on the label always wins.
  2. Then a barcode that matches the box from setup. Only the GTIN is compared, so DataMatrix serials and expiry dates are ignored.
  3. Then name and strength on the label.
  4. Then the pill's look.
- **Text recognition.** [`expo-text-extractor`](https://github.com/pchalupa/expo-text-extractor) uses Apple Vision on iOS and Google ML Kit on Android, both on the device.
- **Label parsing.** Handles South African decimal commas ("12,5 mg"), common OCR slips ("5OO mg", "l mg"), mcg/g conversion, concentrations ("120 mg/5 ml") and combinations ("50/12.5 mg").

### Accuracy gate (PRD R3)

```bash
npm run eval --workspace @dosewise/core -- fixtures/label-cases.json
```

`fixtures/label-cases.json` holds 40 hand-written label texts. They pass, but they are **not** the gate. The gate is 500 real photos on real phones:

1. Install a `preview` build. It has tester mode; store builds don't.
2. Turn on **Settings → Testing → Photo check tester mode**.
3. After each check, tap whether the photo showed the right strength or a different one. The app saves the label text and the result, never the photo.
4. Use **Share test cases**, then run the same `eval` command on the exported file.

The pill-matching thresholds (`PILL_SAME`, `PILL_DIFFERENT` in `fingerprint.ts`) are starting values. Calibrate them on the same photo set.

## Phase 3 (backend and WhatsApp): what is built

Family updates are optional and off by default. Without them the app never goes online.

**How it works**

1. **Sign-in.** The patient signs in with an SMS code (Cognito passwordless). Only the Family updates screen needs this.
2. **Consent.** The patient adds a family member and sees a consent screen with the exact message they would receive. Agreeing is recorded in an append-only consent log.
3. **Invite.** The family member gets a WhatsApp invite with buttons: Alerts / Daily summary / Both / No thanks. Nothing else is sent until they choose. Numbers not on WhatsApp get SMS automatically.
4. **Dose times.** While sharing is on, the phone uploads dose *times and statuses* for 24 h back and 48 h ahead. It never uploads schedules, history or photos, and sends medicine names only if the patient turns that on.
5. **Missed doses.** A sweep every 5 minutes alerts on times still unconfirmed 60 minutes after they were due. Each time is alerted at most once, and each family member gets at most 5 alerts a day. Because times are uploaded ahead, family is told even if the phone is off.
6. **Daily summary.** Sent at 20:00 in the patient's time zone, e.g. "1 of 3 doses confirmed today. Not confirmed: 14:00. Skipped: 18:00."
7. **Stopping.** Either side can stop at any time: the patient in the app, the family member by replying STOP. A family member who gets updates about two people and replies STOP as text is stopped for both. CALL returns the patient's number, only if the patient allowed it.
8. **Data rights.** The app can download everything held online and delete the online account (POPIA s23–25). The consent log is kept 5 years as evidence; it holds ids and dates only, no names or numbers.

**Security**

- **Data residency:** af-south-1.
- **Database:** Aurora PostgreSQL in isolated subnets. It is TLS-only, never logs SQL, and is encrypted with a customer-managed KMS key.
- **Field encryption:** names and numbers are also encrypted per field (KMS envelope, AES-256-GCM). Replies are matched to a number with a KMS HMAC, so no plaintext is needed for lookups.
- **API access:** every app route requires a Cognito JWT, and the patient id comes only from the token. The webhook rejects any request without Meta's signature.
- **Logs:** no message text in logs or the message table. Logs are kept 90 days.
- **Tests:** the infra tests check these properties, so an edit can't quietly weaken them.

**Departures from the PRD (deliberate)**

- **Scheduling:** a 5-minute sweep replaces one timer per dose. It can't leave orphan timers, and it still meets the 15-minute target.
- **Dose times:** uploaded ahead rather than the phone reporting misses, so a dead phone still triggers alerts.

### Deploy and launch checklist

These need an AWS account and a Meta Business account, so none of them have been run.

```bash
cd infra
npx cdk bootstrap aws://ACCOUNT/af-south-1
npx cdk deploy -c stage=staging -c whatsappPhoneNumberId=YOUR_NUMBER_ID
```

1. **WhatsApp secret.** In Secrets Manager, set `accessToken` (a permanent system-user token) and `appSecret` on the WhatsApp secret. `verifyToken` is generated for you.
2. **Webhook.** In Meta, register `WebhookUrl` (a stack output) with that verify token, and subscribe to `messages`.
3. **Templates.** Submit the 5 templates: run `npm run templates --workspace @dosewise/api` and use its output. Wait for approval.
4. **SMS.** Move SNS SMS out of the sandbox for af-south-1, and register an alphanumeric sender ID for South Africa (`-c smsSenderId=DoseWise`). For SMS replies, provision a two-way number in AWS End User Messaging and point it at `SmsRepliesTopicArn`.
5. **Cognito SMS.** Confirm Cognito can send SMS codes from af-south-1 for SA numbers; if not, configure its SMS role in a supported region.
6. **App build.** Set `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_COGNITO_CLIENT_ID` and `EXPO_PUBLIC_AWS_REGION` in `apps/mobile/eas.json` for the build profile.
7. **Database role.** Create the `dosewise_retention` role, the only one allowed to delete from the consent log.
8. **Phase gate (PRD).** Get the privacy impact assessment signed off and pass an independent penetration test.
9. **Legal.** Register the Information Officer with the Information Regulator, and sign data processing agreements with AWS (with a BAA if HIPAA applies), Meta and the SMS provider.

## Phase 4 (launch): what is built

The full launch pack (store privacy answers, privacy policy draft, beta plan, go/no-go gates) is a shared document: https://claude.ai/artifact/LtwffqxeRYqACFp6UpSbaS

- **Reminder check** (`src/app/reminder-check.tsx`, `src/lib/health.ts`):
  - Checks notification permission and Android 12+'s exact-alarm permission ("Alarms & reminders"). Without it, Android may delay reminders by minutes and critical alarms lose alarm-clock delivery, with no warning.
  - Guides battery-saver settings per phone maker (Samsung, Xiaomi, Huawei, Oppo and others) and iOS Focus.
  - The Today screen warns whenever something needs fixing.
- **First run** (`src/app/welcome.tsx`): what DoseWise is and isn't, where data lives, and Standard or Easy View. Easy View is pre-selected when the phone uses large text. Shown again if `LEGAL_VERSION` changes.
- **About** (`src/app/about.tsx`): version, medical disclaimer, privacy policy, and a feedback email that includes the app and phone version only.
- **Store readiness:**
  - App icon, adaptive icon and splash screen.
  - Version 1.0.0.
  - iOS privacy manifest (no tracking, 5 data types).
  - Unused permissions removed: draw over other apps, Face ID text, microphone, storage.
  - App Store listing in `apps/mobile/store.config.json`, validated against the EAS metadata schema; push with `eas metadata:push`.

### Crash reporting (Sentry)

- **Consent:** opt-in. It's on by default only in `preview` (beta) builds, where the beta consent covers it. Store builds ask on the welcome screen, unticked. People can switch it off in Settings → Privacy, and that stops reports straight away.
- **Scrubbing:** every JS report passes through `scrubEvent` / `scrubBreadcrumb` in `packages/core/src/scrub.ts` (tested). These work from an allow-list:
  - **Kept:** the error type, the stack trace, a redacted message, app and OS version, and phone model.
  - **Dropped:** user, request, extras and device name.
  - **Redacted** from message text: quoted text, doses, numbers, email addresses and URL queries.
  - **Breadcrumbs:** only route changes survive, without their parameters. Touch, console and network breadcrumbs are dropped.
- **Capture features off:** screenshots, view hierarchy, accessibility ids, network capture, performance tracing and default PII. The app also never calls `Sentry.wrap`, so no touch breadcrumbs (which would record button labels such as "Marks Metformin as taken").
- **Screen crashes:** the root `ErrorBoundary` reports them and shows a safe "Try again" screen.
- **Native crashes:** these are sent by Sentry's native SDKs and don't pass through the JS scrubber. They hold native stack frames and device model, plus JS breadcrumbs that were already scrubbed. Set up the Sentry project as below to cover them.

Setup status:
- [x] **Organisation and project:** `dosewise`, in Sentry's **EU region**, has the project `dosewise-mobile` (React Native, default new-issue alert).
- [x] **Organisation-wide privacy:**
  - data scrubber on, with default rules plus DoseWise fields (medicine, dosage, dose, doseKey, displayName, phone, caregiver, label, barcode);
  - IP addresses not stored;
  - enhanced privacy on (no event details in alert emails);
  - native crash dumps not stored.
- [x] **DSN:** set for the `preview` and `production` builds in `eas.json`. A DSN only lets the app send reports; it isn't a secret.
- [ ] **Source maps:** add `SENTRY_AUTH_TOKEN` (an organisation token with the `org:ci` scope) as an EAS secret, so release builds upload them:
  `eas env:create --name SENTRY_AUTH_TOKEN --visibility secret --environment preview --environment production`
- [ ] **Retention:** event retention depends on the Sentry plan. On a plan that allows it, set 90 days to match the privacy policy; otherwise update the policy to the plan's period.
- [ ] **Check it works:** in a `preview` build, use Settings → Testing → Send a test crash report, and confirm it appears in `dosewise-mobile`.

Sentry adds about 2 MB to the JS bundle.

Before public release, follow the go/no-go gates in the launch pack. In short: deploy the backend, get the WhatsApp templates approved, complete the legal sign-offs and publish the privacy and deletion pages, then run the 50-person closed beta and meet its targets.

## Deploy a test backend (before the WhatsApp templates are approved)

Staging runs in **test messaging mode**. Nothing goes out by WhatsApp or SMS: each message is written to a test outbox instead.

- In beta builds, the Family screen shows a **Test messages** section. It lists what each family member would have received and lets you tap their buttons or reply STOP as them, so the whole flow can be tested: invite, consent, missed-dose alert, daily summary, STOP.
- The production stack refuses test mode, and the test routes (`/v1/test/*`) exist only on staging, behind sign-in.

Deploys run from GitHub Actions (**Actions → Deploy staging → Run workflow**). GitHub signs in to AWS with OIDC, so no AWS keys are stored anywhere.

**One-time setup**, with an AWS account admin:

1. **Turn on the Cape Town region.** In the AWS console, open your account settings → AWS Regions → enable **Africa (Cape Town) af-south-1**. It's off by default and takes a few minutes.
2. **Bootstrap CDK** in that region, once. AWS CloudShell works:
   ```bash
   npx -y aws-cdk@2 bootstrap aws://YOUR_ACCOUNT_ID/af-south-1
   ```
3. **Create the deploy role.** In CloudFormation (region af-south-1), choose Create stack → Upload `infra/bootstrap/github-deploy-role.yaml`, then copy the `RoleArn` output. The role works only for this repository's `staging` environment and can only use the CDK deploy roles.
4. **Add the secret on GitHub.** In the repository, Settings → Environments → New environment `staging` → add the secret `AWS_DEPLOY_ROLE_ARN` with that ARN. Adding yourself as a required reviewer makes every deploy wait for your approval.
5. **Run the deploy.** Actions → **Deploy staging** → Run workflow (messaging mode `test`). The run summary lists `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_COGNITO_CLIENT_ID`. Put both into the `preview` profile in `apps/mobile/eas.json` and build a preview app.
6. **Allow sign-in codes.** Cognito sends them by SMS through Amazon SNS, and new AWS accounts are in the SNS *SMS sandbox*. In SNS (af-south-1) → Text messaging, add each tester's number as a verified destination, and raise the monthly SMS spend limit from its USD 1 default.

**Cost: the free option.** Staging deploys in the **lite** network setup by default. It reaches the database through the Aurora Data API over HTTPS, so it needs no NAT gateway and no private links to AWS services, which are what bill around the clock. The database is still private and encrypted, and it pauses when nobody is using it.

| Setup | What bills all the time | Rough cost |
| --- | --- | --- |
| `lite` (staging default) | 3 encryption keys, 2 stored secrets, a little database storage | about USD 4–6 a month, plus a few US cents per hour of active testing and about USD 0.02 per sign-in SMS |
| `vpc` (same as production) | the above, plus a NAT gateway and 3 private service links in 2 zones | about USD 75–95 a month |

- **Free credits:** a **new AWS account** gets up to USD 200 in credits on AWS's free plan for up to 6 months: USD 100 at sign-up and up to USD 100 more for trying certain services. That covers lite staging for the whole period.
- **If the free plan blocks a service:** AWS says some services aren't available on it. If one DoseWise needs is blocked, upgrade to the paid plan; the credits still apply.
- **Prices:** these are estimates. Check the AWS pricing pages for af-south-1.
- **Clean-up:** delete the `DoseWise-staging` stack in CloudFormation, or run `npx cdk destroy DoseWise-staging -c stage=staging` in `infra/`.

**After Meta approves the templates:** fill in the WhatsApp secret, set the repository variable `WHATSAPP_PHONE_NUMBER_ID`, and run the workflow with messaging mode `live`.

## Not yet built (next phases)

- iOS AlarmKit full-screen alarms (needs a native Expo module)
- Flexible schedules: interval, as-needed, taper
- Voice logging (App Intents / App Actions)
- Opt-in cloud photo check for hard labels (the backend now exists; needs Bedrock and a consent step)
- Push notification to the patient when a family member stops updates (today they see it on the Family screen)
- Guardian consent for patients under 18 (the app is 18+ at launch)
- Dark high-contrast theme
- Translations

## License

MIT. See [LICENSE](LICENSE).

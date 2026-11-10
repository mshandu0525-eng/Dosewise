-- DoseWise API schema (Aurora PostgreSQL, af-south-1).
-- Personal fields ending in _enc are AES-256-GCM ciphertext under a KMS-protected data key.
-- *_index columns are keyed HMACs (KMS HMAC key) so a reply can be matched to a number without decrypting.

CREATE TABLE IF NOT EXISTS patients (
  id                  TEXT PRIMARY KEY,               -- Cognito user id (sub)
  display_name_enc    TEXT,                           -- name shown to family, e.g. "Thandi"
  phone_enc           TEXT,                           -- patient's own number, for the CALL reply
  tz                  TEXT NOT NULL DEFAULT 'Africa/Johannesburg',
  include_med_names   BOOLEAN NOT NULL DEFAULT FALSE, -- patient opted in to names in family messages
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS caregivers (
  id                  TEXT PRIMARY KEY,
  patient_id          TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  name_enc            TEXT NOT NULL,
  phone_enc           TEXT NOT NULL,
  phone_index         TEXT NOT NULL,
  status              TEXT NOT NULL,                  -- invited | active | declined | stopped | revoked
  wants_alerts        BOOLEAN NOT NULL DEFAULT FALSE,
  wants_summary       BOOLEAN NOT NULL DEFAULT FALSE,
  channel             TEXT NOT NULL DEFAULT 'whatsapp', -- whatsapp | sms
  invited_at          TIMESTAMPTZ NOT NULL,
  activated_at        TIMESTAMPTZ,
  ended_at            TIMESTAMPTZ,
  last_summary_date   TEXT,                           -- patient-local yyyy-mm-dd of the last summary sent
  alerts_date         TEXT,                           -- patient-local day the counter below applies to
  alerts_today        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS caregivers_phone_index ON caregivers (phone_index);
CREATE INDEX IF NOT EXISTS caregivers_patient ON caregivers (patient_id);

-- Evidence of every consent given or withdrawn. Kept 5 years, also after account deletion,
-- so it holds no names or numbers: only ids, the notice version shown, and what changed.
CREATE TABLE IF NOT EXISTS consents (
  id                  BIGSERIAL PRIMARY KEY,
  patient_id          TEXT NOT NULL,
  caregiver_id        TEXT,
  kind                TEXT NOT NULL,
  actor               TEXT NOT NULL,                  -- patient | caregiver | system
  notice_version      TEXT,
  details             JSONB NOT NULL DEFAULT '{}',
  at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consents_patient ON consents (patient_id);

-- One row per dose time (all medicines due at that time), uploaded ahead by the phone.
CREATE TABLE IF NOT EXISTS slots (
  patient_id          TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  key                 TEXT NOT NULL,                  -- patient-local "yyyy-mm-ddTHH:MM"
  due_at              TIMESTAMPTZ NOT NULL,
  alert_at            TIMESTAMPTZ NOT NULL,           -- due_at + grace window
  critical            BOOLEAN NOT NULL DEFAULT FALSE,
  status              TEXT NOT NULL,                  -- open | taken | skipped
  medicines_enc       TEXT,                           -- only when the patient opted in to names
  alerted_at          TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (patient_id, key)
);
CREATE INDEX IF NOT EXISTS slots_alert ON slots (alert_at);

-- Delivery log for WhatsApp/SMS messages: ids and status only, never the text.
CREATE TABLE IF NOT EXISTS messages (
  id                  TEXT PRIMARY KEY,               -- provider message id
  patient_id          TEXT NOT NULL,
  caregiver_id        TEXT NOT NULL,
  kind                TEXT NOT NULL,
  channel             TEXT NOT NULL,
  status              TEXT NOT NULL,
  error_code          INTEGER,
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_patient ON messages (patient_id);

-- Test messaging mode (staging only): messages are written here instead of being sent
-- through WhatsApp or SMS, so the whole flow can be tested before Meta approves the
-- templates. Always empty in production. Kept 7 days.
CREATE TABLE IF NOT EXISTS test_outbox (
  id                  TEXT PRIMARY KEY,
  channel             TEXT NOT NULL,                  -- whatsapp | sms
  to_index            TEXT NOT NULL,                  -- same keyed hash as caregivers.phone_index
  to_enc              TEXT NOT NULL,
  template            TEXT,
  text                TEXT NOT NULL,
  buttons             JSONB NOT NULL DEFAULT '[]',
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS test_outbox_to ON test_outbox (to_index);

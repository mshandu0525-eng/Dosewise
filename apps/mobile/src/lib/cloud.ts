/**
 * DoseWise online account and API. Only needed for family updates: everything else
 * works without an account. Sign-in is by SMS code (Cognito passwordless); a random
 * password is set at sign-up because Cognito requires one, and nobody ever sees it.
 *
 * Tokens are kept in the Keychain / Keystore, never in the app database or logs.
 */
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

const REGION = process.env.EXPO_PUBLIC_AWS_REGION ?? "af-south-1";
const CLIENT_ID = process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID ?? "";
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const TOKENS = "dosewise.cloud.tokens.v1";
const keyOpts: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

/** False in builds without a deployed backend (empty or placeholder values), which hides family updates. */
export const cloudConfigured = API_URL.startsWith("https://") && /^[a-z0-9]{20,}$/i.test(CLIENT_ID);

interface Tokens {
  idToken: string;
  refreshToken: string;
  expiresAt: number;
  phone: string;
}

let tokens: Tokens | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded) return;
  loaded = true;
  const raw = SecureStore.getItem(TOKENS, keyOpts);
  tokens = raw ? (JSON.parse(raw) as Tokens) : null;
}

function save(next: Tokens | null) {
  tokens = next;
  if (next) SecureStore.setItem(TOKENS, JSON.stringify(next), keyOpts);
  else void SecureStore.deleteItemAsync(TOKENS, keyOpts);
  listeners.forEach((l) => l());
}

export function signedInPhone(): string | null {
  load();
  return tokens?.phone ?? null;
}

export const useSignedIn = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    signedInPhone,
  );

/* ---------------- Cognito (JSON API over HTTPS) ---------------- */

class CognitoError extends Error {
  constructor(public type: string, message: string) {
    super(message);
  }
}

async function cognito<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://cognito-idp.${REGION}.amazonaws.com/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": `AWSCognitoIdentityProviderService.${action}` },
    body: JSON.stringify({ ClientId: CLIENT_ID, ...body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const type = String(json.__type ?? "Error").split("#").pop()!;
    throw new CognitoError(type, json.message ?? "Sign-in failed.");
  }
  return json as T;
}

type AuthResult = { AuthenticationResult?: { IdToken: string; RefreshToken?: string; ExpiresIn: number }; Session?: string; ChallengeName?: string };

function store(phone: string, r: AuthResult, refreshToken?: string) {
  const a = r.AuthenticationResult;
  if (!a) throw new CognitoError("NoTokens", "Sign-in did not complete.");
  save({ idToken: a.IdToken, refreshToken: a.RefreshToken ?? refreshToken ?? "", expiresAt: Date.now() + (a.ExpiresIn - 60) * 1000, phone });
}

export type PendingSignIn = { phone: string; kind: "new" | "existing"; session?: string };

/** Step 1: sends an SMS code. New numbers get an account; existing ones a sign-in code. */
export async function startSignIn(phone: string): Promise<PendingSignIn> {
  try {
    const password = `${Crypto.randomUUID()}Aa1!`;
    await cognito("SignUp", { Username: phone, Password: password, UserAttributes: [{ Name: "phone_number", Value: phone }] });
    return { phone, kind: "new" };
  } catch (e) {
    if (!(e instanceof CognitoError) || e.type !== "UsernameExistsException") throw e;
  }
  const r = await cognito<AuthResult>("InitiateAuth", {
    AuthFlow: "USER_AUTH",
    AuthParameters: { USERNAME: phone, PREFERRED_CHALLENGE: "SMS_OTP" },
  });
  return { phone, kind: "existing", session: r.Session };
}

/** Step 2: the code from the SMS. */
export async function finishSignIn(p: PendingSignIn, code: string): Promise<void> {
  if (p.kind === "new") {
    const confirmed = await cognito<{ Session?: string }>("ConfirmSignUp", { Username: p.phone, ConfirmationCode: code });
    // Confirming returns a session that signs the new user straight in.
    const r = await cognito<AuthResult>("InitiateAuth", { AuthFlow: "USER_AUTH", AuthParameters: { USERNAME: p.phone }, Session: confirmed.Session });
    store(p.phone, r);
    return;
  }
  const r = await cognito<AuthResult>("RespondToAuthChallenge", {
    ChallengeName: "SMS_OTP",
    Session: p.session,
    ChallengeResponses: { USERNAME: p.phone, SMS_OTP_CODE: code },
  });
  store(p.phone, r);
}

export function signOut() {
  save(null);
}

async function idToken(): Promise<string> {
  load();
  if (!tokens) throw new CognitoError("NotSignedIn", "Please sign in.");
  if (Date.now() < tokens.expiresAt) return tokens.idToken;
  try {
    const r = await cognito<AuthResult>("InitiateAuth", { AuthFlow: "REFRESH_TOKEN_AUTH", AuthParameters: { REFRESH_TOKEN: tokens.refreshToken } });
    store(tokens.phone, r, tokens.refreshToken);
    return tokens!.idToken;
  } catch (e) {
    if (e instanceof CognitoError && e.type === "NotAuthorizedException") save(null);
    throw e;
  }
}

/* ---------------- DoseWise API ---------------- */

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(method: "GET" | "PUT" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await idToken()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error ?? "Something went wrong.");
  return json as T;
}

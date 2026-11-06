import * as Application from "expo-application";
import * as Device from "expo-device";
import { Linking, Platform } from "react-native";

/** Bump when the in-app notice or privacy policy changes materially: people are shown the welcome notice again. */
export const LEGAL_VERSION = "2026-11-v1";

export const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL ?? "https://dosewise.example/privacy";
export const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? "support@dosewise.example";

export const appVersion = () => `${Application.nativeApplicationVersion ?? "dev"} (${Application.nativeBuildVersion ?? "0"})`;

export function openPrivacyPolicy() {
  return Linking.openURL(PRIVACY_URL);
}

/** Opens an email to support with the app and phone version only. Never includes medicines or history. */
export function emailSupport(subject = "DoseWise feedback") {
  const body = [
    "",
    "",
    "----",
    `App: ${appVersion()}`,
    `Phone: ${Device.manufacturer ?? ""} ${Device.modelName ?? ""}, ${Platform.OS} ${Device.osVersion ?? ""}`,
    "Please don't include details of your medicines unless you want to.",
  ].join("\n");
  return Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
}

/**
 * On-device image work for photo verification. Nothing here uses the network:
 * text recognition runs in Apple Vision (iOS) / Google ML Kit (Android), and
 * the pill fingerprint is computed in JavaScript from a 96-pixel thumbnail.
 *
 * Dose-time photos are deleted as soon as they are processed (discardPhoto).
 */
import { pillFingerprint, type PillFingerprint } from "@dosewise/core";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { extractTextFromImage, isSupported as textSupported } from "expo-text-extractor";
import { decode as decodeJpeg } from "jpeg-js";
import { Platform } from "react-native";

export interface Photo {
  uri: string;
  width: number;
  height: number;
}

/** Share of the shorter side covered by the on-screen guide frame; only that square is analysed for pills. */
export const GUIDE_FRACTION = 0.6;

export const canReadText = textSupported;

/** Lines of text on a label, in reading order. */
export async function readText(photo: Photo): Promise<string[]> {
  if (!textSupported) return [];
  // The Android module wants a file path; iOS accepts the file:// URL.
  const source = Platform.OS === "android" ? photo.uri.replace(/^file:\/\//, "") : photo.uri;
  const blocks = await extractTextFromImage(source);
  return blocks.flatMap((b) => b.split("\n")).map((l) => l.trim()).filter(Boolean);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Fingerprint of the pill inside the guide frame, or null if no pill stands out from the background. */
export async function fingerprintPill(photo: Photo): Promise<PillFingerprint | null> {
  const side = Math.round(Math.min(photo.width, photo.height) * GUIDE_FRACTION);
  const ref = await ImageManipulator.manipulate(photo.uri)
    .crop({ originX: Math.round((photo.width - side) / 2), originY: Math.round((photo.height - side) / 2), width: side, height: side })
    .resize({ width: 96, height: 96 })
    .renderAsync();
  const saved = await ref.saveAsync({ base64: true, format: SaveFormat.JPEG, compress: 0.95 });
  discardPhoto(saved.uri);
  if (!saved.base64) return null;
  const img = decodeJpeg(base64ToBytes(saved.base64), { useTArray: true, formatAsRGBA: true });
  return pillFingerprint(img.data, img.width, img.height);
}

/** Small JPEG for showing the person their own pill or box. Stored only in the encrypted database. */
export async function thumbnail(photo: Photo, width = 360): Promise<string | undefined> {
  const ref = await ImageManipulator.manipulate(photo.uri).resize({ width }).renderAsync();
  const saved = await ref.saveAsync({ base64: true, format: SaveFormat.JPEG, compress: 0.6 });
  discardPhoto(saved.uri);
  return saved.base64;
}

/** Deletes a photo file from the cache. Never throws. */
export function discardPhoto(uri: string) {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Cache files are also cleared by the OS; failing to delete must not break logging.
  }
}

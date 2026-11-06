/**
 * Two presets on one interface (PRD section 1). Easy View changes size,
 * contrast and wording, never where things are.
 *
 * Contrast on white: Standard muted text #4F5763 ≈ 7.4:1; Easy View uses
 * near-black text and a darker primary for WCAG AAA (7:1 or more) everywhere.
 */
import { useSettings } from "./store";

const standard = {
  colors: {
    bg: "#F6F4EF",
    card: "#FFFFFF",
    text: "#1A1D21",
    muted: "#4F5763",
    border: "#D5D9DF",
    primary: "#1D5C54",
    onPrimary: "#FFFFFF",
    success: "#17663A",
    successBg: "#E2F2E8",
    danger: "#A3221A",
    dangerBg: "#FBE9E7",
    warning: "#7A4F00",
    warningBg: "#FFF1CC",
    neutralBg: "#ECEEF1",
  },
  size: { title: 28, heading: 20, body: 17, small: 15, target: 48, gap: 12, radius: 16, icon: 22 },
};

export type Theme = typeof standard & { easy: boolean };

const easy: typeof standard = {
  colors: {
    ...standard.colors,
    bg: "#FFFFFF",
    text: "#000000",
    muted: "#2B3038",
    border: "#5B6370",
    primary: "#0E3F39",
    success: "#0F5130",
    danger: "#8A1810",
    warning: "#5C3B00",
  },
  size: { title: 34, heading: 26, body: 22, small: 19, target: 64, gap: 16, radius: 18, icon: 30 },
};

export function useTheme(): Theme {
  const { easyView } = useSettings();
  return { ...(easyView ? easy : standard), easy: easyView };
}

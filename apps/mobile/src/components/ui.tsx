import Ionicons from "@expo/vector-icons/Ionicons";
import type { DoseStatus } from "@dosewise/core";
import type { ComponentProps, ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

export function Screen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const t = useTheme();
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: t.size.gap }}>{children}</ScrollView>
      {footer}
    </SafeAreaView>
  );
}

type TextKind = "title" | "heading" | "body" | "small";

export function T({
  kind = "body",
  muted,
  bold,
  color,
  style,
  children,
  ...rest
}: { kind?: TextKind; muted?: boolean; bold?: boolean; color?: string; style?: TextStyle } & ComponentProps<typeof Text>) {
  const t = useTheme();
  const size = t.size[kind];
  return (
    <Text
      {...rest}
      style={[
        {
          fontSize: size,
          lineHeight: Math.round(size * 1.3),
          color: color ?? (muted ? t.colors.muted : t.colors.text),
          fontWeight: bold || kind === "title" || kind === "heading" ? "700" : "400",
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.colors.card,
          borderRadius: t.size.radius,
          borderWidth: t.easy ? 2 : StyleSheet.hairlineWidth,
          borderColor: t.colors.border,
          padding: 16,
          gap: 8,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

type ButtonVariant = "primary" | "outline" | "ghost" | "danger";

export function Button({
  label,
  icon,
  onPress,
  variant = "primary",
  hint,
  flex,
  disabled,
  iconOnly,
}: {
  label: string;
  /** Show only the icon; the label is still read by the screen reader. */
  iconOnly?: boolean;
  icon?: IconName;
  onPress: () => void;
  variant?: ButtonVariant;
  /** Read by the screen reader after the label. */
  hint?: string;
  flex?: boolean;
  disabled?: boolean;
}) {
  const t = useTheme();
  const bg = { primary: t.colors.primary, outline: t.colors.card, ghost: "transparent", danger: t.colors.dangerBg }[variant];
  const fg = { primary: t.colors.onPrimary, outline: t.colors.primary, ghost: t.colors.primary, danger: t.colors.danger }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: flex ? 1 : undefined,
        minHeight: t.size.target,
        minWidth: t.size.target,
        borderRadius: 999,
        paddingHorizontal: 18,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: bg,
        borderWidth: variant === "outline" ? 2 : 0,
        borderColor: t.colors.primary,
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      {icon && <Ionicons name={icon} size={t.size.icon} color={fg} />}
      {!iconOnly && <Text style={{ color: fg, fontSize: t.size.body, fontWeight: "700" }}>{label}</Text>}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: t.size.target,
        minWidth: t.size.target,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 16,
        borderRadius: 999,
        borderWidth: 2,
        borderColor: selected ? t.colors.primary : t.colors.border,
        backgroundColor: selected ? t.colors.primary : t.colors.card,
      }}
    >
      <Text style={{ fontSize: t.size.small, fontWeight: "600", color: selected ? t.colors.onPrimary : t.colors.text }}>
        {selected ? "✓ " : ""}
        {label}
      </Text>
    </Pressable>
  );
}

/** Status shown as colour + icon + word, so it never relies on colour alone. */
export function StatusBadge({ status }: { status: DoseStatus }) {
  const t = useTheme();
  const look: Record<DoseStatus, { label: string; icon: IconName; fg: string; bg: string }> = {
    taken: { label: "Taken", icon: "checkmark-circle", fg: t.colors.success, bg: t.colors.successBg },
    skipped: { label: "Skipped", icon: "play-skip-forward", fg: t.colors.muted, bg: t.colors.neutralBg },
    missed: { label: "Missed", icon: "alert-circle", fg: t.colors.danger, bg: t.colors.dangerBg },
    due: { label: "Due now", icon: "alarm", fg: t.colors.warning, bg: t.colors.warningBg },
    upcoming: { label: "Later", icon: "time-outline", fg: t.colors.muted, bg: t.colors.neutralBg },
  };
  const l = look[status];
  return (
    <View
      accessible
      accessibilityLabel={`Status: ${l.label}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: l.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}
    >
      <Ionicons name={l.icon} size={t.size.small} color={l.fg} />
      <Text style={{ color: l.fg, fontSize: t.size.small, fontWeight: "700" }}>{l.label}</Text>
    </View>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const t = useTheme();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }}
      style={{ height: t.easy ? 14 : 10, borderRadius: 999, backgroundColor: t.colors.neutralBg, overflow: "hidden" }}
    >
      <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: "100%", backgroundColor: t.colors.primary }} />
    </View>
  );
}

export function Row({ children, wrap, style }: { children: ReactNode; wrap?: boolean; style?: ViewStyle }) {
  return <View style={[{ flexDirection: "row", gap: 8, flexWrap: wrap ? "wrap" : "nowrap", alignItems: "center" }, style]}>{children}</View>;
}

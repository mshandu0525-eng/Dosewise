import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { LEGAL_VERSION } from "@/lib/legal";
import { useSettings } from "@/lib/store";
import { useTheme } from "@/lib/theme";

/** Standard: 4 tabs. Easy View: Today and Settings only; the rest is reached from Settings. */
export default function TabsLayout() {
  const t = useTheme();
  const { acceptedLegalVersion } = useSettings();
  const hidden = t.easy ? null : undefined;
  if (acceptedLegalVersion !== LEGAL_VERSION) return <Redirect href="/welcome" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.primary,
        tabBarInactiveTintColor: t.colors.muted,
        tabBarLabelStyle: { fontSize: t.easy ? 18 : 13, fontWeight: "600" },
        tabBarStyle: { height: t.easy ? 96 : 72, paddingTop: 6, backgroundColor: t.colors.card },
        tabBarIconStyle: { marginBottom: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Today", tabBarIcon: ({ color }) => <Ionicons name="today" size={t.size.icon} color={color as string} /> }}
      />
      <Tabs.Screen
        name="medications"
        options={{
          title: "Medicines",
          href: hidden,
          tabBarIcon: ({ color }) => <Ionicons name="medkit" size={t.size.icon} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="report"
        options={{
          title: "Report",
          href: hidden,
          tabBarIcon: ({ color }) => <Ionicons name="bar-chart" size={t.size.icon} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarIcon: ({ color }) => <Ionicons name="settings" size={t.size.icon} color={color as string} /> }}
      />
    </Tabs>
  );
}

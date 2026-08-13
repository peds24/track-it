// `Tabs` is re-exported from `expo-router` but deprecated there in SDK 57 in
// favour of this entry point.
import { Tabs } from 'expo-router/js-tabs';
import { useTheme } from '@/ui/theme';

export default function TabsLayout() {
  const c = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.faint,
        tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.rule },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Currently' }} />
      <Tabs.Screen name="backlog" options={{ title: 'Backlog' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

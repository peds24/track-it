// `Tabs` is re-exported from `expo-router` but deprecated there in SDK 57 in
// favour of this entry point.
import { Tabs } from 'expo-router/js-tabs';
import { theme } from '@/ui/theme';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: theme.color.accent }}>
      <Tabs.Screen name="index" options={{ title: 'Currently' }} />
      <Tabs.Screen name="backlog" options={{ title: 'Backlog' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

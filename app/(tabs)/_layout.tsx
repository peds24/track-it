// `Tabs` is re-exported from `expo-router` but deprecated there in SDK 57 in
// favour of this entry point.
import { Tabs } from 'expo-router/js-tabs';
import { useTheme } from '@/ui/theme';

export default function TabsLayout() {
  const c = useTheme();

  return (
    <Tabs
      screenOptions={{
        // Each screen draws its own title, so the navigator's header would be a
        // second, smaller "Currently" stacked above ours.
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.faint,
        tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.rule },
        // The design is text-only. Without this the navigator reserves space for
        // an icon and fills it with a missing-glyph placeholder box.
        tabBarIconStyle: { display: 'none' },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 0 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Currently' }} />
      <Tabs.Screen name="backlog" options={{ title: 'Backlog' }} />
      {/* No Settings tab: export/import is deferred past v1, and it was the only
          thing Settings held. An empty tab is worse than one fewer tab. */}
    </Tabs>
  );
}

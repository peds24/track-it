// `Tabs` is re-exported from `expo-router` but deprecated there in SDK 57 in
// favour of this entry point.
import { Tabs } from 'expo-router/js-tabs';
import { Platform, Pressable } from 'react-native';
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
        // The label is the entire tab, so it carries the weight an icon would
        // normally take.
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600', marginTop: 0 },
        tabBarItemStyle: { paddingVertical: 4 },

        /**
         * The default tab button is a PlatformPressable with
         * `android_ripple: { borderless: true }`, which fires a circular ripple
         * from the tap point across the whole tab. On a text-only bar there is
         * no icon for it to originate from, so it reads as an unrelated blob.
         * A plain Pressable gives the same behaviour without it; the active
         * tint already signals which tab is selected.
         */
        tabBarButton: ({
          children,
          style,
          onPress,
          onLongPress,
          testID,
          accessibilityState,
          accessibilityLabel,
        }) => (
          <Pressable
            android_ripple={null}
            onPress={onPress}
            onLongPress={onLongPress}
            testID={testID}
            accessibilityState={accessibilityState}
            accessibilityLabel={accessibilityLabel}
            role={Platform.OS === 'ios' ? 'button' : 'tab'}
            style={style}
          >
            {children}
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Currently' }} />
      <Tabs.Screen name="backlog" options={{ title: 'Backlog' }} />
      {/* No Settings tab: export/import is deferred past v1, and it was the only
          thing Settings held. An empty tab is worse than one fewer tab. */}
    </Tabs>
  );
}

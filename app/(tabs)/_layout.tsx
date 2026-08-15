// `Tabs` is re-exported from `expo-router` but deprecated there in SDK 57 in
// favour of this entry point.
import { Tabs } from 'expo-router/js-tabs';
import { Platform, Pressable, Text } from 'react-native';
import { font, underline, useTheme } from '@/ui/theme';

export default function TabsLayout() {
  const c = useTheme();

  return (
    <Tabs
      screenOptions={{
        // Each screen draws its own title, so the navigator's header would be a
        // second, smaller "Currently" stacked above ours.
        headerShown: false,
        tabBarActiveTintColor: c.ink,
        tabBarInactiveTintColor: c.faint,
        tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.ruleStrong, borderTopWidth: 1.5 },
        // The design is text-only. Without this the navigator reserves space for
        // an icon and fills it with a missing-glyph placeholder box.
        tabBarIconStyle: { display: 'none' },
        // No accent left to mark the active tab, so the label underlines
        // instead — the same mark the kind label uses.
        //
        // "Currently tracking" is wider than a third of the screen at this
        // size in a monospace face, so it wraps to two lines rather than
        // shrinking — "Currently" and "tracking" each fit a tab's width on
        // their own, and centering keeps the wrap looking deliberate instead
        // of ragged. Font size stays 16 across every tab: that size was
        // raised from 11 specifically because the bar read too small, and a
        // two-word label is not a reason to undo that for every tab, or even
        // for just this one.
        tabBarLabel: ({ focused, color, children }) => (
          <Text
            style={[
              { ...font.control, fontSize: 16, color, marginTop: 0, textAlign: 'center' },
              focused && underline,
            ]}
          >
            {children}
          </Text>
        ),
        tabBarItemStyle: { paddingVertical: 6 },

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
      <Tabs.Screen name="index" options={{ title: 'Currently tracking' }} />
      <Tabs.Screen name="backlog" options={{ title: 'Backlog' }} />
      <Tabs.Screen name="done" options={{ title: 'Done' }} />
      {/* No Settings tab: export/import is deferred past v1, and it was the only
          thing Settings held. An empty tab is worse than one fewer tab. */}
    </Tabs>
  );
}

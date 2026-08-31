// `Tabs` is re-exported from `expo-router` but deprecated there in SDK 57 in
// favour of this entry point.
import { Tabs } from 'expo-router/js-tabs';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { font, radius, useTheme } from '@/ui/theme';

export default function TabsLayout() {
  const c = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.onSecondaryContainer,
        tabBarInactiveTintColor: c.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: c.surfaceContainer,
          borderTopColor: c.outlineVariant,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Platform.OS === 'ios' ? 84 : 72,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
        },
        tabBarIconStyle: { display: 'none' },
        tabBarLabel: ({ focused, children }) => (
          <View style={[styles.pillContainer, focused && { backgroundColor: c.secondaryContainer }]}>
            <Text
              style={[
                font.labelLarge,
                styles.label,
                { color: focused ? c.onSecondaryContainer : c.onSurfaceVariant },
                focused ? styles.activeLabel : styles.inactiveLabel,
              ]}
            >
              {children}
            </Text>
          </View>
        ),
        tabBarItemStyle: { paddingVertical: 2, alignItems: 'center', justifyContent: 'center' },
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
      <Tabs.Screen name="done" options={{ title: 'Done' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  pillContainer: {
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 84,
    height: 34,
  },
  label: {
    textAlign: 'center',
  },
  activeLabel: {
    fontWeight: '800',
  },
  inactiveLabel: {
    fontWeight: '600',
  },
});



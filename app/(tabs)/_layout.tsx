// `Tabs` is re-exported from `expo-router` but deprecated there in SDK 57 in
// favour of this entry point.
import { Tabs } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { font, radius, useTheme } from '@/ui/theme';

type TabIconProps = {
  focused: boolean;
  activeIcon: keyof typeof Ionicons.glyphMap;
  inactiveIcon: keyof typeof Ionicons.glyphMap;
  label: string;
};

function TabItem({ focused, activeIcon, inactiveIcon, label }: TabIconProps) {
  const c = useTheme();

  return (
    <View style={styles.itemContainer}>
      <View style={[styles.pill, focused && { backgroundColor: c.secondaryContainer }]}>
        <Ionicons
          name={focused ? activeIcon : inactiveIcon}
          size={22}
          color={focused ? c.onSecondaryContainer : c.onSurfaceVariant}
        />
      </View>
      <Text
        style={[
          styles.label,
          { color: focused ? c.onSurface : c.onSurfaceVariant },
          focused ? styles.activeLabel : styles.inactiveLabel,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  const c = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: c.surfaceContainer,
          borderTopColor: c.outlineVariant,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Platform.OS === 'ios' ? 88 : 76,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 26 : 8,
        },
        tabBarShowLabel: false,
        tabBarItemStyle: { alignItems: 'center', justifyContent: 'center' },
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
      <Tabs.Screen
        name="index"
        options={{
          title: 'Currently',
          tabBarIcon: ({ focused }) => (
            <TabItem
              focused={focused}
              activeIcon="play-circle"
              inactiveIcon="play-circle-outline"
              label="Currently"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="backlog"
        options={{
          title: 'Backlog',
          tabBarIcon: ({ focused }) => (
            <TabItem
              focused={focused}
              activeIcon="bookmark"
              inactiveIcon="bookmark-outline"
              label="Backlog"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="done"
        options={{
          title: 'Done',
          tabBarIcon: ({ focused }) => (
            <TabItem
              focused={focused}
              activeIcon="checkmark-circle"
              inactiveIcon="checkmark-circle-outline"
              label="Done"
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  itemContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
  },
  pill: {
    width: 60,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...font.labelSmall,
    fontSize: 12,
    marginTop: 3,
    textAlign: 'center',
  },
  activeLabel: {
    fontWeight: '700',
  },
  inactiveLabel: {
    fontWeight: '500',
  },
});




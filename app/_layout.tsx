import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { DatabaseProvider } from '@/ui/DatabaseProvider';
import { font, useTheme } from '@/ui/theme';

export default function RootLayout() {
  const c = useTheme();
  const dark = useColorScheme() === 'dark';

  return (
    <DatabaseProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: c.surface },
          headerTintColor: c.onSurface,
          headerTitleStyle: { color: c.onSurface, ...font.titleLarge },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.surface },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="add"
          options={{ presentation: 'modal', headerShown: true, title: 'Add a track' }}
        />
      </Stack>

      <StatusBar style={dark ? 'light' : 'dark'} />
    </DatabaseProvider>
  );
}


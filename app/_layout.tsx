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
      {/* The navigator draws its own header on the add modal, and it does not
          inherit the app's palette — left alone it stays white with black text
          on a dark ground. Every colour it uses comes from the theme. */}
      <Stack
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.ink,
          headerTitleStyle: { color: c.ink, ...font.rowTitle },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="add"
          options={{ presentation: 'modal', headerShown: true, title: 'Add a track' }}
        />
      </Stack>

      {/* Light glyphs on a dark ground, and the reverse — without this the
          clock and battery are invisible in one of the two themes. */}
      <StatusBar style={dark ? 'light' : 'dark'} />
    </DatabaseProvider>
  );
}

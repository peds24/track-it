import { Stack } from 'expo-router';
import { DatabaseProvider } from '@/ui/DatabaseProvider';

export default function RootLayout() {
  return (
    <DatabaseProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="add"
          options={{ presentation: 'modal', headerShown: true, title: 'Add a track' }}
        />
      </Stack>
    </DatabaseProvider>
  );
}

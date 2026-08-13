import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { SqlDriver } from '@/db/driver';
import { openExpoDatabase } from '@/db/expoDriver';
import { migrate } from '@/db/schema';
import { theme } from '@/ui/theme';

const DatabaseContext = createContext<SqlDriver | null>(null);

export function useDatabase(): SqlDriver {
  const db = useContext(DatabaseContext);
  if (!db) throw new Error('useDatabase must be used inside DatabaseProvider');
  return db;
}

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<SqlDriver | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    openExpoDatabase()
      .then(async (driver) => {
        await migrate(driver);
        setDb(driver);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: theme.space.lg }}>
        <Text style={{ color: theme.color.text }}>Could not open your library: {error}</Text>
      </View>
    );
  }

  if (!db) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <DatabaseContext.Provider value={db}>{children}</DatabaseContext.Provider>;
}

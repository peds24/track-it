import { useCallback, useEffect, useState } from 'react';
import { listTracks, type TrackSummary } from '@/data/trackRepo';
import type { Category, Shelf } from '@/domain/types';
import { useDatabase } from '@/ui/DatabaseProvider';

export function useTracks(shelf: Shelf, category?: Category) {
  const db = useDatabase();
  const [tracks, setTracks] = useState<TrackSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setTracks(await listTracks(db, shelf, category));
    } finally {
      setLoading(false);
    }
  }, [db, shelf, category]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { tracks, reload, loading };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { listTracks, type TrackSummary } from '@/data/trackRepo';
import type { Category, Shelf } from '@/domain/types';
import { useDatabase } from '@/ui/DatabaseProvider';

export function useTracks(shelf: Shelf, category?: Category) {
  const db = useDatabase();
  const [tracks, setTracks] = useState<TrackSummary[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * Two filter taps in quick succession start two queries, and the slower one
   * can land last — leaving Shows on screen under a highlighted Books chip.
   * Only the most recent request is allowed to write state.
   */
  const requestId = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await listTracks(db, shelf, category);
      if (id !== requestId.current || !mounted.current) return;
      setTracks(result);
    } finally {
      if (id === requestId.current && mounted.current) setLoading(false);
    }
  }, [db, shelf, category]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { tracks, reload, loading };
}

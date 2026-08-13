import { migrate } from '@/db/schema';
import { createMemoryDriver } from '../../../test/memoryDriver';

test('migrate creates both tables', async () => {
  const db = createMemoryDriver();
  await migrate(db);

  const tables = await db.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
  );
  const names = tables.map((t) => t.name);
  expect(names).toContain('series');
  expect(names).toContain('entry');
});

test('migrate is idempotent', async () => {
  const db = createMemoryDriver();
  await migrate(db);
  await expect(migrate(db)).resolves.not.toThrow();
});

test('the schema rejects an unknown status', async () => {
  const db = createMemoryDriver();
  await migrate(db);
  await expect(
    db.run(
      `INSERT INTO entry (id, series_id, title, ordinal, media_type, status, created_at)
       VALUES ('e1', NULL, 'Dune', NULL, 'book', 'reading', '2026-08-12')`,
    ),
  ).rejects.toThrow();
});

test('deleting a series deletes its entries', async () => {
  const db = createMemoryDriver();
  await migrate(db);
  await db.run(
    `INSERT INTO series (id, title, media_type, unit_label, created_at)
     VALUES ('s1', 'Berserk', 'manga', 'volume', '2026-08-12')`,
  );
  await db.run(
    `INSERT INTO entry (id, series_id, title, ordinal, media_type, status, created_at)
     VALUES ('e1', 's1', 'Volume 1', 1, 'volume', 'unstarted', '2026-08-12')`,
  );
  await db.run(`DELETE FROM series WHERE id = 's1'`);

  const rows = await db.all(`SELECT id FROM entry`);
  expect(rows).toHaveLength(0);
});

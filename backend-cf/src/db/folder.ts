import { nowUnixSeconds } from '../lib/time';

export type FolderRow = {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  created_at: number | null;
  updated_at: number | null;
};

export type FolderDto = {
  id: string;
  name: string;
  icon: string;
};

export type FolderInput = {
  name: string;
  icon?: string;
};

export type FolderPatch = Partial<FolderInput>;

export function toFolderDto(row: FolderRow): FolderDto {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon ?? '',
  };
}

export async function listFolders(
  db: D1Database,
  userId: string,
  query?: string,
): Promise<FolderRow[]> {
  const sql = query?.trim()
    ? `SELECT * FROM folders
       WHERE user_id = ? AND LOWER(name) LIKE LOWER(?)
       ORDER BY created_at ASC`
    : `SELECT * FROM folders WHERE user_id = ? ORDER BY created_at ASC`;
  const stmt = db.prepare(sql);
  const result = query?.trim()
    ? await stmt.bind(userId, `%${query.trim()}%`).all<FolderRow>()
    : await stmt.bind(userId).all<FolderRow>();
  return result.results ?? [];
}

export async function getFolder(
  db: D1Database,
  userId: string,
  id: string,
): Promise<FolderRow | null> {
  return db
    .prepare(`SELECT * FROM folders WHERE id = ? AND user_id = ? LIMIT 1`)
    .bind(id, userId)
    .first<FolderRow>();
}

export async function createFolder(
  db: D1Database,
  userId: string,
  input: FolderInput,
): Promise<FolderRow> {
  const id = crypto.randomUUID();
  const now = nowUnixSeconds();
  await db
    .prepare(
      `INSERT INTO folders (id, user_id, name, icon, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, userId, input.name, input.icon ?? '', now, now)
    .run();

  const row = await getFolder(db, userId, id);
  if (!row) throw new Error('Failed to load created folder');
  return row;
}

export async function updateFolder(
  db: D1Database,
  userId: string,
  id: string,
  patch: FolderPatch,
): Promise<FolderRow | null> {
  const existing = await getFolder(db, userId, id);
  if (!existing) return null;

  const name = patch.name ?? existing.name;
  const icon = patch.icon !== undefined ? patch.icon : existing.icon;
  const now = nowUnixSeconds();

  await db
    .prepare(
      `UPDATE folders SET name = ?, icon = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
    )
    .bind(name, icon, now, id, userId)
    .run();

  return getFolder(db, userId, id);
}

export async function deleteFolder(
  db: D1Database,
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM folders WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

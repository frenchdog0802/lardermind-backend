import { Hono } from 'hono';
import { ok, fail } from '../lib/api-response';
import type { Env } from '../env';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import { findUserById } from '../db/users';
import {
  checkAndIncrementImageUpload,
  QuotaExceededError,
} from '../db/quotas';
import {
  mergeAddPantryItem,
  toPantryItemDto,
  type PantryItemDto,
} from '../db/pantry';
import { isAllowedImageMime, MAX_IMAGE_BYTES } from '../lib/media';
import {
  recognizePantryFromImage,
  VisionNotConfiguredError,
  VisionProviderError,
} from '../vision/recognize';
import { MAX_VISION_ITEMS } from '../vision/parse';

const VISION_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const pantryVisionRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

pantryVisionRoutes.use('/api/pantry-vision/*', requireAuth);

pantryVisionRoutes.post('/api/pantry-vision/recognize', async (c) => {
  const userId = c.get('userId');

  let body: Record<string, string | File>;
  try {
    body = await c.req.parseBody();
  } catch {
    return c.json(fail('Invalid multipart body'), 400);
  }

  const file = body['image'];
  if (!(file instanceof File)) {
    return c.json(
      fail('Missing image field (multipart field name: image)'),
      400,
    );
  }

  const mime = (file.type || '').toLowerCase();
  if (!VISION_MIME.has(mime) || !isAllowedImageMime(mime)) {
    return c.json(
      fail('Unsupported image type. Allowed: jpeg, png, webp'),
      400,
    );
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return c.json(fail('Image exceeds 8 MB limit'), 413);
  }

  const user = await findUserById(c.env.DB, userId);
  if (!user) {
    return c.json(fail('User not found'), 401);
  }

  try {
    await checkAndIncrementImageUpload(c.env.DB, userId, {
      isAdmin: user.role === 'admin',
      isPro: false,
    });
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      return c.json(fail(error.message), 403);
    }
    throw error;
  }

  try {
    const bytes = await file.arrayBuffer();
    const items = await recognizePantryFromImage(c.env, { mime, bytes });
    const message =
      items.length === 0 ? 'No food items recognized.' : null;
    return c.json(ok({ items, message }, 'Recognition complete'));
  } catch (error) {
    if (error instanceof VisionNotConfiguredError) {
      return c.json(fail(error.message), 503);
    }
    if (error instanceof VisionProviderError) {
      return c.json(fail(error.message), 503);
    }
    console.error('pantry-vision recognize failed', error);
    return c.json(fail('Vision recognition failed'), 503);
  }
});

type ApplyItemBody = {
  category?: string;
  name?: string;
  quantity?: number;
  unit?: string;
};

pantryVisionRoutes.post('/api/pantry-vision/apply', async (c) => {
  const userId = c.get('userId');

  let body: { items?: ApplyItemBody[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail('Invalid JSON body'), 400);
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return c.json(fail('items must be a non-empty array'), 400);
  }
  if (body.items.length > MAX_VISION_ITEMS) {
    return c.json(fail(`At most ${MAX_VISION_ITEMS} items allowed`), 400);
  }

  const normalized = body.items
    .map((row) => {
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      const quantity =
        typeof row.quantity === 'number' && Number.isFinite(row.quantity)
          ? Math.max(0, row.quantity)
          : 0;
      const unit =
        typeof row.unit === 'string' && row.unit.trim()
          ? row.unit.trim()
          : 'pcs';
      return { name, quantity, unit };
    })
    .filter((row) => row.name.length > 0);

  if (normalized.length === 0) {
    return c.json(fail('No valid items to apply'), 400);
  }

  const resultItems: PantryItemDto[] = [];
  let added = 0;
  let merged = 0;

  for (const row of normalized) {
    const { item, merged: wasMerged } = await mergeAddPantryItem(
      c.env.DB,
      userId,
      row,
    );
    resultItems.push(toPantryItemDto(item));
    if (wasMerged) merged += 1;
    else added += 1;
  }

  return c.json(
    ok(
      { items: resultItems, added, merged },
      'Pantry items applied successfully',
    ),
  );
});

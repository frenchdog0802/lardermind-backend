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
  buildObjectKey,
  isAllowedImageMime,
  MAX_IMAGE_BYTES,
  mediaUrl,
  parsePublicId,
} from '../lib/media';

export const uploadRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

uploadRoutes.use('/api/upload/*', requireAuth);

uploadRoutes.post('/api/upload/image', async (c) => {
  const userId = c.get('userId');

  let body: Record<string, string | File>;
  try {
    body = await c.req.parseBody();
  } catch {
    return c.json(fail('Invalid multipart body'), 400);
  }

  const file = body['file'] || body['image'];
  if (!(file instanceof File)) {
    return c.json(
      fail('Missing file field (multipart field name: file or image)'),
      400,
    );
  }

  const mime = (file.type || '').toLowerCase();
  if (!isAllowedImageMime(mime)) {
    return c.json(
      fail('Unsupported image type. Allowed: jpeg, png, webp, gif'),
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

  const publicId = buildObjectKey(userId, mime);
  const bytes = await file.arrayBuffer();

  try {
    await c.env.R2.put(publicId, bytes, {
      httpMetadata: { contentType: mime },
      customMetadata: { uploadedBy: userId },
    });
  } catch (error) {
    console.error('R2.put failed after quota increment', error);
    return c.json(fail('Failed to store image'), 500);
  }

  const origin = new URL(c.req.url).origin;
  const imageUrl = mediaUrl(origin, publicId);

  return c.json(
    ok(
      {
        imageUrl,
        publicId,
        image_url: imageUrl,
        public_id: publicId,
      },
      'Image uploaded successfully',
    ),
  );
});

uploadRoutes.delete('/api/upload/image/:publicId{.+}', async (c) => {
  const userId = c.get('userId');
  const raw = c.req.param('publicId');
  // Path may be percent-encoded; Hono usually decodes params.
  const publicId = decodeURIComponent(raw);

  const parsed = parsePublicId(publicId);
  if (!parsed) {
    return c.json(fail('Invalid publicId'), 400);
  }

  if (parsed.userId !== userId) {
    return c.json(fail('Forbidden'), 403);
  }

  const existing = await c.env.R2.head(publicId);
  if (!existing) {
    return c.json(fail('Image not found'), 404);
  }

  await c.env.R2.delete(publicId);
  return c.json(ok({ deleted: true }, 'Image deleted'));
});

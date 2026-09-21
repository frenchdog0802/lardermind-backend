export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OBJECT_NAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/i;

export function extensionForMime(mime: string): string | null {
  return MIME_TO_EXT[mime.toLowerCase()] ?? null;
}

export function isAllowedImageMime(mime: string): boolean {
  return ALLOWED_IMAGE_MIME.has(mime.toLowerCase());
}

export function buildObjectKey(userId: string, mime: string): string {
  const ext = extensionForMime(mime);
  if (!ext) {
    throw new Error(`Unsupported MIME type: ${mime}`);
  }
  return `${userId}/${crypto.randomUUID()}.${ext}`;
}

export function parsePublicId(publicId: string): {
  userId: string;
  objectName: string;
} | null {
  const slash = publicId.indexOf('/');
  if (slash <= 0 || slash === publicId.length - 1) return null;
  const userId = publicId.slice(0, slash);
  const objectName = publicId.slice(slash + 1);
  if (!isValidMediaPath(userId, objectName)) return null;
  return { userId, objectName };
}

export function isValidMediaPath(userId: string, objectName: string): boolean {
  if (!UUID_RE.test(userId)) return false;
  if (!OBJECT_NAME_RE.test(objectName)) return false;
  if (objectName.includes('/') || objectName.includes('..')) return false;
  return true;
}

export function mediaUrl(origin: string, publicId: string): string {
  const base = origin.replace(/\/$/, '');
  return `${base}/api/media/${publicId}`;
}

export const MEDIA_CACHE_CONTROL =
  'public, max-age=31536000, immutable';

import { describe, expect, it } from 'vitest';
import {
  buildObjectKey,
  extensionForMime,
  isAllowedImageMime,
  isValidMediaPath,
  mediaUrl,
  parsePublicId,
} from './media';

describe('media helpers', () => {
  it('maps MIME to extension', () => {
    expect(extensionForMime('image/jpeg')).toBe('jpg');
    expect(extensionForMime('image/png')).toBe('png');
    expect(extensionForMime('image/webp')).toBe('webp');
    expect(extensionForMime('image/gif')).toBe('gif');
    expect(extensionForMime('text/plain')).toBeNull();
  });

  it('allows only image MIME types', () => {
    expect(isAllowedImageMime('image/jpeg')).toBe(true);
    expect(isAllowedImageMime('IMAGE/PNG')).toBe(true);
    expect(isAllowedImageMime('application/pdf')).toBe(false);
  });

  it('builds namespaced object keys', () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const key = buildObjectKey(userId, 'image/jpeg');
    expect(key.startsWith(`${userId}/`)).toBe(true);
    expect(key.endsWith('.jpg')).toBe(true);
    expect(parsePublicId(key)).toEqual({
      userId,
      objectName: key.slice(userId.length + 1),
    });
  });

  it('validates media path segments', () => {
    const userId = '11111111-1111-1111-1111-111111111111';
    const objectName = '22222222-2222-2222-2222-222222222222.jpg';
    expect(isValidMediaPath(userId, objectName)).toBe(true);
    expect(isValidMediaPath('not-a-uuid', objectName)).toBe(false);
    expect(isValidMediaPath(userId, '../evil.jpg')).toBe(false);
    expect(isValidMediaPath(userId, 'foo/bar.jpg')).toBe(false);
  });

  it('builds media URLs', () => {
    expect(mediaUrl('http://127.0.0.1:8787', 'u/a.jpg')).toBe(
      'http://127.0.0.1:8787/api/media/u/a.jpg',
    );
  });
});

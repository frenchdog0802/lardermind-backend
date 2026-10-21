import { describe, expect, it } from 'vitest';
import {
  classifyCookStatus,
  conditionalSeasonings,
  isDefaultSeasoning,
  missingMains,
} from './seasonings';

describe('isDefaultSeasoning', () => {
  it('matches trim and case-insensitive Chinese staples', () => {
    expect(isDefaultSeasoning('鹽')).toBe(true);
    expect(isDefaultSeasoning(' 醬油 ')).toBe(true);
    expect(isDefaultSeasoning('蒜')).toBe(true);
  });

  it('rejects empty and non-staples', () => {
    expect(isDefaultSeasoning('')).toBe(false);
    expect(isDefaultSeasoning('   ')).toBe(false);
    expect(isDefaultSeasoning('山藥')).toBe(false);
    expect(isDefaultSeasoning('排骨')).toBe(false);
  });
});

describe('classifyCookStatus', () => {
  it('cookable when nothing missing', () => {
    expect(classifyCookStatus([], true)).toBe('cookable');
    expect(classifyCookStatus([], false)).toBe('cookable');
  });

  it('conditionally_cookable when only seasonings missing and assume ON', () => {
    expect(classifyCookStatus(['醬油', '糖'], true)).toBe(
      'conditionally_cookable',
    );
  });

  it('uncookable when seasonings missing but assume OFF', () => {
    expect(classifyCookStatus(['醬油', '糖'], false)).toBe('uncookable');
  });

  it('uncookable when any main is missing', () => {
    expect(classifyCookStatus(['山藥', '鹽'], true)).toBe('uncookable');
    expect(classifyCookStatus(['排骨'], true)).toBe('uncookable');
  });
});

describe('missingMains / conditionalSeasonings', () => {
  it('splits mains vs seasonings', () => {
    expect(missingMains(['山藥', '鹽', '薑'])).toEqual(['山藥']);
    expect(conditionalSeasonings(['醬油', '糖', '山藥'])).toEqual([
      '醬油',
      '糖',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { translationLanguages, translationLanguageScope } from './translation-language-data.js';

describe('Translation target language seed', () => {
  it('contains the requested language variants in display order', () => {
    expect(translationLanguages).toEqual([
      { code: 'VI', name: 'Vietnamese', localeCode: 'vi-VN', displayOrder: 10 },
      { code: 'MS-MY', name: 'Malay (Malaysia)', localeCode: 'ms-MY', displayOrder: 20 },
      { code: 'ID', name: 'Indonesian', localeCode: 'id-ID', displayOrder: 30 },
      { code: 'MS-BN', name: 'Malay (Brunei)', localeCode: 'ms-BN', displayOrder: 40 },
    ]);
  });

  it('uses unique governed codes and locales at Global scope', () => {
    expect(translationLanguageScope).toBe('GLOBAL');
    expect(new Set(translationLanguages.map(({ code }) => code)).size).toBe(
      translationLanguages.length,
    );
    expect(new Set(translationLanguages.map(({ localeCode }) => localeCode)).size).toBe(
      translationLanguages.length,
    );
    expect(translationLanguages.every(({ code }) => /^[A-Z][A-Z0-9-]*$/.test(code))).toBe(true);
    expect(
      translationLanguages.every(({ localeCode }) => /^[a-z]{2}-[A-Z]{2}$/.test(localeCode)),
    ).toBe(true);
  });
});

export const translationLanguageScope = 'GLOBAL' as const;

export const translationLanguages = [
  { code: 'VI', name: 'Vietnamese', localeCode: 'vi-VN', displayOrder: 10 },
  { code: 'MS-MY', name: 'Malay (Malaysia)', localeCode: 'ms-MY', displayOrder: 20 },
  { code: 'ID', name: 'Indonesian', localeCode: 'id-ID', displayOrder: 30 },
  { code: 'MS-BN', name: 'Malay (Brunei)', localeCode: 'ms-BN', displayOrder: 40 },
] as const;

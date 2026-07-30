export const legacyLikelihoods = [
  { code: '1', label: 'Very low / Rare', definition: 'Very low / Rare' },
  { code: '2', label: 'Low / Unlikely', definition: 'Low / Unlikely' },
  { code: '3', label: 'Possible / Moderate', definition: 'Possible / Moderate' },
  { code: '4', label: 'Hight Likely', definition: 'Hight Likely' },
  { code: '5', label: 'Almost Certain', definition: 'Almost Certain' },
] as const;

export const legacySeverities = [
  { code: 'A', label: 'Slight', definition: 'Slight' },
  { code: 'B', label: 'Minor', definition: 'Minor' },
  { code: 'C', label: 'Moderate', definition: 'Moderate' },
  { code: 'D', label: 'Major', definition: 'Major' },
  { code: 'E', label: 'Catastrophic', definition: 'Catastrophic' },
] as const;

export const legacyRiskResults = [
  {
    code: 'DARK_GREEN',
    name: 'Dark Green',
    description: 'Lowest risk colour zone.',
    semanticCategory: 'Continuous improvement',
    color: '#4f7335',
    guidance:
      'Manage for continuous improvement, although PV Drilling may set lower priority for further risk reduction.',
    prohibited: false,
  },
  {
    code: 'LIGHT_GREEN',
    name: 'Light Green',
    description: 'Controlled risk colour zone.',
    semanticCategory: 'Continuous improvement',
    color: '#90c65a',
    guidance:
      'Manage for continuous improvement through the effective implementation of the QHSE Management System.',
    prohibited: false,
  },
  {
    code: 'YELLOW',
    name: 'Yellow',
    description: 'ALARP risk colour zone.',
    semanticCategory: 'ALARP',
    color: '#fff20a',
    guidance:
      'Identify and implement controls and recovery measures to reduce risk to As Low As Reasonably Practicable (ALARP).',
    prohibited: false,
  },
  {
    code: 'RED',
    name: 'Red',
    description: 'Highest risk colour zone.',
    semanticCategory: 'Additional controls required',
    color: '#ff1f2d',
    guidance:
      'Identify and implement additional controls and recovery measures to reduce the risk to ALARP. If the risk remains in the red zone, the task must not proceed and Onshore Management must be consulted. The Code of Safe Working Practices may be reviewed for reference.',
    prohibited: true,
  },
] as const;

type LegacyCell = {
  rating: 'L' | 'M' | 'H' | 'E';
  result: (typeof legacyRiskResults)[number]['code'];
};

export const legacyMatrixCells: Record<string, readonly LegacyCell[]> = {
  '1': [
    { rating: 'L', result: 'DARK_GREEN' },
    { rating: 'L', result: 'DARK_GREEN' },
    { rating: 'L', result: 'DARK_GREEN' },
    { rating: 'L', result: 'DARK_GREEN' },
    { rating: 'M', result: 'LIGHT_GREEN' },
  ],
  '2': [
    { rating: 'L', result: 'DARK_GREEN' },
    { rating: 'L', result: 'DARK_GREEN' },
    { rating: 'M', result: 'LIGHT_GREEN' },
    { rating: 'M', result: 'LIGHT_GREEN' },
    { rating: 'H', result: 'YELLOW' },
  ],
  '3': [
    { rating: 'L', result: 'DARK_GREEN' },
    { rating: 'M', result: 'LIGHT_GREEN' },
    { rating: 'H', result: 'LIGHT_GREEN' },
    { rating: 'H', result: 'YELLOW' },
    { rating: 'H', result: 'YELLOW' },
  ],
  '4': [
    { rating: 'L', result: 'DARK_GREEN' },
    { rating: 'M', result: 'LIGHT_GREEN' },
    { rating: 'H', result: 'YELLOW' },
    { rating: 'H', result: 'YELLOW' },
    { rating: 'E', result: 'RED' },
  ],
  '5': [
    { rating: 'M', result: 'LIGHT_GREEN' },
    { rating: 'H', result: 'YELLOW' },
    { rating: 'H', result: 'YELLOW' },
    { rating: 'E', result: 'RED' },
    { rating: 'E', result: 'RED' },
  ],
};

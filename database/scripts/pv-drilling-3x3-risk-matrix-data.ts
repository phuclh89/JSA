export const pvDrilling3x3Likelihoods = [
  { code: '1', label: 'LOW', definition: 'Remote' },
  { code: '2', label: 'MED', definition: 'Possible' },
  { code: '3', label: 'HIGH', definition: 'Probable' },
] as const;

export const pvDrilling3x3Severities = [
  {
    code: '1',
    label: 'LOW',
    generalDefinition: 'No injury / No damage / No pollution',
    peopleDefinition: 'No injury',
    assetDefinition: 'No damage',
    environmentDefinition: 'No pollution',
  },
  {
    code: '2',
    label: 'MED',
    generalDefinition: 'First aid injury / Minor damage / Minor pollution',
    peopleDefinition: 'First aid injury',
    assetDefinition: 'Minor damage',
    environmentDefinition: 'Minor pollution',
  },
  {
    code: '3',
    label: 'HIGH',
    generalDefinition: 'Lost time injury / Major damage / Major pollution',
    peopleDefinition: 'Lost time injury',
    assetDefinition: 'Major damage',
    environmentDefinition: 'Major pollution',
  },
] as const;

export const pvDrilling3x3RiskResults = [
  {
    code: 'ACCEPTABLE',
    name: 'Acceptable',
    description: 'White result zone from Procedure Reference P1.04.09.',
    semanticCategory: 'Acceptable',
    color: '#FFFFFF',
    guidance: 'Acceptable risk.',
    prohibited: false,
  },
  {
    code: 'TOLERABLE',
    name: 'Tolerable',
    description: 'Yellow result zone from Procedure Reference P1.04.09.',
    semanticCategory: 'Tolerable',
    color: '#FFF200',
    guidance: 'Tolerable risk.',
    prohibited: false,
  },
  {
    code: 'UNACCEPTABLE',
    name: 'Unacceptable',
    description: 'Red result zone from Procedure Reference P1.04.09.',
    semanticCategory: 'Unacceptable',
    color: '#FF0000',
    guidance: 'Unacceptable risk; reduce the risk before submission or work proceeds.',
    prohibited: true,
  },
] as const;

type PvDrilling3x3Cell = {
  rating: '1' | '2' | '3' | '4' | '6' | '9';
  value: 1 | 2 | 3 | 4 | 6 | 9;
  result: (typeof pvDrilling3x3RiskResults)[number]['code'];
};

export const pvDrilling3x3MatrixCells: Record<string, readonly PvDrilling3x3Cell[]> = {
  '1': [
    { rating: '1', value: 1, result: 'ACCEPTABLE' },
    { rating: '2', value: 2, result: 'ACCEPTABLE' },
    { rating: '3', value: 3, result: 'TOLERABLE' },
  ],
  '2': [
    { rating: '2', value: 2, result: 'ACCEPTABLE' },
    { rating: '4', value: 4, result: 'UNACCEPTABLE' },
    { rating: '6', value: 6, result: 'UNACCEPTABLE' },
  ],
  '3': [
    { rating: '3', value: 3, result: 'TOLERABLE' },
    { rating: '6', value: 6, result: 'UNACCEPTABLE' },
    { rating: '9', value: 9, result: 'UNACCEPTABLE' },
  ],
};

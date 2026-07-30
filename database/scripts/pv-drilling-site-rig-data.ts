export const pvDrillingSites = [
  {
    code: 'OFFSHORE',
    name: 'Offshore',
    sequenceCode: 'OFFSHORE',
    rigs: [
      { code: 'PVD-I', name: 'PV DRILLING I' },
      { code: 'PVD-II', name: 'PV DRILLING II' },
      { code: 'PVD-III', name: 'PV DRILLING III' },
      { code: 'PVD-V', name: 'PV DRILLING V' },
      { code: 'PVD-VI', name: 'PV DRILLING VI' },
      { code: 'PVD-VIII', name: 'PV DRILLING VIII' },
      { code: 'PVD-IX', name: 'PV DRILLING IX' },
      { code: 'PVD-X', name: 'PV DRILLING X' },
    ],
  },
  {
    code: 'ONSHORE',
    name: 'Onshore',
    sequenceCode: 'ONSHORE',
    rigs: [{ code: 'SHOREBASE', name: 'Shorebase' }],
  },
] as const;

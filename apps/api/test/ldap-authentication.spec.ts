import {
  buildBindCandidates,
  normalizeLoginName,
} from '../src/modules/security/application/ldap-authentication.service';

describe('LDAP login name normalization', () => {
  it.each([
    ['phuclh', 'phuclh'],
    ['PVDRILLING\\phuclh', 'phuclh'],
    ['phuclh@pvdrilling.com.vn', 'phuclh'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeLoginName(input)).toBe(expected);
  });
});

describe('LDAP direct-bind candidates', () => {
  it('tries the supplied name, account name, UPN, and NetBIOS name', () => {
    expect(buildBindCandidates('phuclh', 'pvdrilling.com.vn', 'PVDRILLING')).toEqual([
      'phuclh',
      'phuclh@pvdrilling.com.vn',
      'PVDRILLING\\phuclh',
    ]);
  });

  it('normalizes a domain-qualified input and removes duplicate candidates', () => {
    expect(buildBindCandidates('PVDRILLING\\phuclh', 'pvdrilling.com.vn', 'PVDRILLING')).toEqual([
      'PVDRILLING\\phuclh',
      'phuclh',
      'phuclh@pvdrilling.com.vn',
    ]);
  });
});

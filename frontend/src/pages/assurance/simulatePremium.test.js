import { describe, expect, it } from 'vitest';
import { calculatePremium } from './simulatePremium.js';

const defaultProfile = {
  driverAge: 30,
  licenseYears: 8,
  region: 'urban',
  vehiclePower: 6,
  bonusMalus: 1,
  coverage: 'comprehensive',
  roadsideAssistance: false,
  legalProtection: false,
};

describe('calculatePremium', () => {
  it('returns a risk-adjusted annual estimate and monthly equivalent', () => {
    const result = calculatePremium(defaultProfile);

    expect(result).toEqual({
      basePremium: 300,
      riskAdjustment: 312,
      optionsCost: 0,
      annualPremium: 612,
      monthlyPremium: 51,
    });
  });

  it('adds selected options to the total without changing the base premium', () => {
    const result = calculatePremium({
      ...defaultProfile,
      roadsideAssistance: true,
      legalProtection: true,
    });

    expect(result.basePremium).toBe(300);
    expect(result.optionsCost).toBe(88);
    expect(result.annualPremium).toBe(700);
  });
});
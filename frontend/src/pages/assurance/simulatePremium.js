const AGE_FACTORS = [
  { max: 24, factor: 1.6 },
  { max: 34, factor: 1.15 },
  { max: 59, factor: 0.9 },
  { max: Infinity, factor: 1.05 },
];

const ZONE_FACTORS = {
  urban: 1.2,
  suburban: 1,
  rural: 0.9,
};

const COVERAGE_FACTORS = {
  thirdParty: 0.88,
  extended: 1.15,
  comprehensive: 1.45,
};

const OPTION_COSTS = {
  roadsideAssistance: 60,
  legalProtection: 28,
};

function getAgeFactor(age) {
  return AGE_FACTORS.find(({ max }) => age <= max).factor;
}

function getLicenseFactor(years) {
  if (years < 2) return 1.3;
  if (years < 6) return 1.12;
  return 1;
}

export function calculatePremium(profile) {
  const riskFactor =
    getAgeFactor(profile.driverAge) *
    getLicenseFactor(profile.licenseYears) *
    ZONE_FACTORS[profile.region] *
    (0.9 + (profile.vehiclePower - 4) * 0.06) *
    profile.bonusMalus *
    COVERAGE_FACTORS[profile.coverage];
  const premiumBeforeOptions = Math.round(300 * riskFactor);
  const optionsCost =
    (profile.roadsideAssistance ? OPTION_COSTS.roadsideAssistance : 0) +
    (profile.legalProtection ? OPTION_COSTS.legalProtection : 0);
  const annualPremium = premiumBeforeOptions + optionsCost;

  return {
    basePremium: 300,
    riskAdjustment: premiumBeforeOptions - 300,
    optionsCost,
    annualPremium,
    monthlyPremium: Math.round(annualPremium / 12),
  };
}

export function simulatePremium(profile, delayMs = 150) {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(calculatePremium(profile)), delayMs);
  });
}
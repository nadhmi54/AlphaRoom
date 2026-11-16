import { useEffect, useState } from 'react';
import ModuleShell from '../../components/ModuleShell/ModuleShell.jsx';
import { simulatePremium } from './simulatePremium.js';
import './InsuranceSimulatorPage.css';

const INITIAL_PROFILE = {
  driverAge: 30,
  licenseYears: 8,
  region: 'urban',
  vehiclePower: 6,
  bonusMalus: 1,
  coverage: 'comprehensive',
  roadsideAssistance: false,
  legalProtection: false,
};

const euroFormat = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

function SliderField({ id, label, value, min, max, step = 1, formatValue, onChange, hint }) {
  const progress = max === min ? 0 : ((value - min) / (max - min)) * 100;

  return (
    <div className="insurance-field">
      <div className="insurance-field__heading">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{formatValue(value)}</output>
      </div>
      <input
        className="insurance-range"
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--range-progress': `${progress}%` }}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint && <p className="insurance-field__hint">{hint}</p>}
    </div>
  );
}

function PriceLine({ label, value, subdued = false }) {
  return (
    <div className={`insurance-price-line${subdued ? ' insurance-price-line--subdued' : ''}`}>
      <span>{label}</span>
      <strong>{euroFormat.format(value)}</strong>
    </div>
  );
}

export default function InsuranceSimulatorPage() {
  const [profile, setProfile] = useState(INITIAL_PROFILE);
  const [quote, setQuote] = useState(null);
  const [isCalculating, setIsCalculating] = useState(true);

  useEffect(() => {
    let active = true;
    setIsCalculating(true);

    simulatePremium(profile).then((nextQuote) => {
      if (!active) return;
      setQuote(nextQuote);
      setIsCalculating(false);
    });

    return () => {
      active = false;
    };
  }, [profile]);

  function updateProfile(field, value) {
    setProfile((current) => {
      const next = { ...current, [field]: value };
      if (field === 'driverAge') {
        next.licenseYears = Math.min(current.licenseYears, Math.max(0, value - 18));
      }
      return next;
    });
  }

  function handleSubmit(event) {
    event.preventDefault();
  }

  return (
    <ModuleShell moduleId="actuariat">
      <div className="insurance-page">
        <div className="insurance-main">
        <div className="insurance-intro">
          <p className="insurance-eyebrow"><span /> SIMULATION PERSONNALISÉE</p>
          <h2>Votre assurance,<br /><em>à votre juste prix.</em></h2>
          <p className="insurance-intro__copy">
            Ajustez votre profil et découvrez une estimation annuelle en temps réel.
          </p>
        </div>

        <div className="insurance-layout">
          <form className="insurance-form" onSubmit={handleSubmit}>
            <section className="insurance-section" aria-labelledby="driver-heading">
              <div className="insurance-section__title">
                <span className="insurance-section__number">01</span>
                <div>
                  <h2 id="driver-heading">Votre profil conducteur</h2>
                  <p>Les informations qui influencent votre niveau de risque.</p>
                </div>
              </div>

              <div className="insurance-fields-grid">
                <SliderField
                  id="driver-age"
                  label="Âge du conducteur"
                  value={profile.driverAge}
                  min={18}
                  max={80}
                  formatValue={(value) => `${value} ans`}
                  onChange={(value) => updateProfile('driverAge', value)}
                />
                <SliderField
                  id="license-years"
                  label="Ancienneté du permis"
                  value={profile.licenseYears}
                  min={0}
                  max={Math.max(0, profile.driverAge - 18)}
                  formatValue={(value) => `${value} ${value > 1 ? 'ans' : 'an'}`}
                  onChange={(value) => updateProfile('licenseYears', value)}
                  hint="L’ancienneté ne peut pas dépasser l’âge du conducteur moins 18 ans."
                />

                <div className="insurance-field">
                  <label htmlFor="region">Zone géographique</label>
                  <select
                    id="region"
                    value={profile.region}
                    onChange={(event) => updateProfile('region', event.target.value)}
                  >
                    <option value="urban">Urbaine</option>
                    <option value="suburban">Semi-urbaine</option>
                    <option value="rural">Rurale</option>
                  </select>
                </div>
                <SliderField
                  id="vehicle-power"
                  label="Puissance fiscale"
                  value={profile.vehiclePower}
                  min={4}
                  max={15}
                  formatValue={(value) => `${value} CV`}
                  onChange={(value) => updateProfile('vehiclePower', value)}
                />
                <SliderField
                  id="bonus-malus"
                  label="Coefficient bonus / malus"
                  value={profile.bonusMalus}
                  min={0.5}
                  max={1.5}
                  step={0.01}
                  formatValue={(value) => value.toFixed(2)}
                  onChange={(value) => updateProfile('bonusMalus', value)}
                  hint="0,50 correspond à un bonus maximal."
                />
              </div>
            </section>

            <section className="insurance-section insurance-section--coverage" aria-labelledby="coverage-heading">
              <div className="insurance-section__title">
                <span className="insurance-section__number">02</span>
                <div>
                  <h2 id="coverage-heading">Votre couverture</h2>
                  <p>Choisissez la formule adaptée à votre véhicule.</p>
                </div>
              </div>

              <div className="insurance-field insurance-field--coverage">
                <label htmlFor="coverage">Formule d’assurance</label>
                <select
                  id="coverage"
                  value={profile.coverage}
                  onChange={(event) => updateProfile('coverage', event.target.value)}
                >
                  <option value="thirdParty">Tiers simple</option>
                  <option value="extended">Tiers étendu</option>
                  <option value="comprehensive">Tous risques</option>
                </select>
              </div>

              <div className="insurance-options">
                <label className="insurance-option" htmlFor="roadside-assistance">
                  <span className="insurance-option__copy">
                    <strong>Assistance 0 km</strong>
                    <small>Dépannage même devant chez vous</small>
                  </span>
                  <span className="insurance-option__price">+60 €/an</span>
                  <input
                    id="roadside-assistance"
                    type="checkbox"
                    checked={profile.roadsideAssistance}
                    onChange={(event) => updateProfile('roadsideAssistance', event.target.checked)}
                  />
                </label>
                <label className="insurance-option" htmlFor="legal-protection">
                  <span className="insurance-option__copy">
                    <strong>Protection juridique</strong>
                    <small>Un accompagnement en cas de litige</small>
                  </span>
                  <span className="insurance-option__price">+28 €/an</span>
                  <input
                    id="legal-protection"
                    type="checkbox"
                    checked={profile.legalProtection}
                    onChange={(event) => updateProfile('legalProtection', event.target.checked)}
                  />
                </label>
              </div>
            </section>
          </form>

          <aside
            className="insurance-summary"
            aria-labelledby="summary-heading"
            aria-busy={isCalculating}
          >
            <div className="insurance-summary__topline">
              <span className="insurance-live"><span /> ESTIMATION EN DIRECT</span>
              <span className="insurance-summary__mark" aria-hidden="true">A</span>
            </div>
            <h2 id="summary-heading">Votre estimation</h2>
            <p className="insurance-summary__caption">Une prime calculée selon votre profil.</p>

            <div className="insurance-total" aria-live="polite">
              <span>Prime totale estimée / an</span>
              {quote ? (
                <strong className={isCalculating ? 'insurance-total__value is-updating' : 'insurance-total__value'}>
                  {euroFormat.format(quote.annualPremium)}
                </strong>
              ) : (
                <span className="insurance-skeleton" aria-label="Calcul de la prime" />
              )}
              <span className="insurance-total__monthly">
                {quote ? `soit ${euroFormat.format(quote.monthlyPremium)} / mois` : 'Calcul en cours…'}
              </span>
            </div>

            <div className="insurance-breakdown" aria-label="Détail de l’estimation">
              {quote ? (
                <>
                  <PriceLine label="Prime de base" value={quote.basePremium} subdued />
                  <PriceLine label="Ajustement du risque" value={quote.riskAdjustment} />
                  <PriceLine label="Coût des options" value={quote.optionsCost} subdued />
                </>
              ) : (
                <>
                  <span className="insurance-breakdown__skeleton" />
                  <span className="insurance-breakdown__skeleton" />
                  <span className="insurance-breakdown__skeleton" />
                </>
              )}
            </div>

            <div className="insurance-summary__footnote">
              <span aria-hidden="true">i</span>
              Estimation indicative simulée, sans valeur contractuelle.
            </div>
          </aside>
        </div>

        <footer className="insurance-footer">
          <span>SIMULATEUR AUTO</span>
          <span>Les tarifs sont donnés à titre indicatif.</span>
        </footer>
      </div>
      </div>
    </ModuleShell>
  );
}
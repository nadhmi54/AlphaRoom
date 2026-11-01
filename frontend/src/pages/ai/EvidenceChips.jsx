import { evidenceLabel } from './aiLabels.js';

// Les « preuves » d'une affirmation : exécution, événement ou minute de la séance.
export default function EvidenceChips({ evidence = [], label = 'Preuves' }) {
  if (evidence.length === 0) return null;
  return (
    <ul className="ai-evidence" aria-label={label}>
      {evidence.map((item, index) => (
        <li key={`${item.type}-${item.id ?? item.value}-${index}`} className="ai-evidence__chip">
          {evidenceLabel(item)}
        </li>
      ))}
    </ul>
  );
}

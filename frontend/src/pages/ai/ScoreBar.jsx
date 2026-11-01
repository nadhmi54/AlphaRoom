// Barre de note : une case par point, remplie jusqu'à la note.
export default function ScoreBar({ score, outOf, label }) {
  const filled = score === null || score === undefined ? 0 : score;
  return (
    <div
      className="ai-scorebar"
      role="img"
      aria-label={label ?? (score === null || score === undefined ? 'Non évalué' : `${score} sur ${outOf}`)}
    >
      {Array.from({ length: outOf }, (_, index) => {
        const fill = Math.max(0, Math.min(1, filled - index));
        return (
          <span key={index} className="ai-scorebar__cell">
            <i style={{ width: `${fill * 100}%` }} />
          </span>
        );
      })}
    </div>
  );
}

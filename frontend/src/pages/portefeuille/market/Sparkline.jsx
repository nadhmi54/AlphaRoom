// Mini-courbe d'une liste d'actifs : un simple tracé, sans axes.
export default function Sparkline({ values, up }) {
  if (!values || values.length < 2) return <svg className="lm-spark" aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 28 - ((value - min) / spread) * 24 - 2;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg className={`lm-spark ${up ? "is-up" : "is-down"}`} viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

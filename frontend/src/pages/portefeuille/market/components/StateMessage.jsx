export default function StateMessage({ loading, error, empty, children }) {
  if (loading) return <div className="state-message is-loading">Chargement...</div>;
  if (error) return <div className="state-message is-error">{error}</div>;
  if (empty) return <div className="state-message is-empty">Aucune donnée disponible.</div>;
  return children;
}

// États d'attente / erreur / vide de l'Academy, homogènes sur toutes les pages.
export default function AcademyState({
  loading,
  error,
  empty,
  emptyText = 'Aucune donnée disponible.',
  onRetry,
  children,
}) {
  if (loading) {
    return (
      <div className="ar-ac__state is-loading" role="status">
        Chargement…
      </div>
    );
  }

  if (error) {
    return (
      <div className="ar-ac__state is-error" role="alert">
        <div>{error}</div>
        {onRetry && (
          <button type="button" className="ar-ac__retry" onClick={onRetry}>
            Réessayer
          </button>
        )}
      </div>
    );
  }

  if (empty) {
    return <div className="ar-ac__state is-empty">{emptyText}</div>;
  }

  return children;
}

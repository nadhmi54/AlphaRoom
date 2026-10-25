/** Onglets de la page, avec un indicateur qui glisse d'un onglet à l'autre. */
export default function CockpitTabs({ tabs, active, onChange }) {
  const index = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === active),
  );
  return (
    <div className="ck-tabs" role="tablist" aria-label="Sections du portefeuille">
      {tabs.map((tab, position) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`ck-tab-${tab.id}`}
          aria-selected={active === tab.id}
          aria-controls={`ck-panel-${tab.id}`}
          className={active === tab.id ? "is-active" : ""}
          onClick={() => onChange(tab.id)}
        >
          <kbd aria-hidden="true">{position + 1}</kbd>
          {tab.label}
          {tab.badge !== undefined && tab.badge !== null && <span>{tab.badge}</span>}
        </button>
      ))}
      <i
        className="ck-tabs-bar"
        aria-hidden="true"
        style={{
          width: `${100 / tabs.length}%`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
    </div>
  );
}

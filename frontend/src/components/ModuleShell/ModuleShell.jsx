import { MODULES } from '../../data/modules.js';
import AppBar from '../AppBar/AppBar.jsx';
import './ModuleShell.css';

// Cadre des pages de module (Portefeuille, Game Room) : barre d'application,
// en-tête du module, puis une zone de travail (`children`).
export default function ModuleShell({ moduleId, children }) {
  const module = MODULES.find((item) => item.id === moduleId);
  if (!module) return null;

  return (
    <div className="ar-mod" style={{ '--mod-accent': module.accent }}>
      <AppBar />

      <div className="ar-mod__head">
        <span className="ar-mod__badge">{module.number}</span>
        <div>
          <h1 className="ar-mod__title">{module.title}</h1>
          <p className="ar-mod__question">{module.question}</p>
        </div>
      </div>

      <main className="ar-mod__content">
        {children ?? (
          <div className="ar-mod__empty">Zone de travail du module {module.number}</div>
        )}
      </main>
    </div>
  );
}

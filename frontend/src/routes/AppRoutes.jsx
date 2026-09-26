import { Routes, Route } from 'react-router-dom';
import HomePage from '../pages/Home/HomePage.jsx';

// Point d'entrée unique pour toutes les routes de l'application. Une seule
// page existe pour l'instant (Home) ; les futures pages (marché, portefeuille,
// formation, meneur de jeu...) s'ajouteront ici au fur et à mesure du
// développement des 6 modules fonctionnels du projet.
export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
    </Routes>
  );
}

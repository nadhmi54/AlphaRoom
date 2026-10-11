import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import HomePage from '../pages/Home/HomePage.jsx';
import LoadingScreen from '../components/LoadingScreen/LoadingScreen.jsx';
import RouteLoader from '../components/RouteLoader/RouteLoader.jsx';

// Chargées à la demande (et non importées en haut du fichier) : ainsi, si une
// de ces pages (ou une de ses dépendances, ex. la config Supabase) a un
// souci, seule la route concernée est affectée — la home page reste servie
// normalement au lieu d'une page blanche pour toute l'app.
const SignInPage = lazy(() => import('../pages/SignIn/SignInPage.jsx'));
const SignUpPage = lazy(() => import('../pages/SignUp/SignUpPage.jsx'));

// Un module = une page = un dossier dans src/pages/Modules/ (une équipe par module).
const M1MarchePage = lazy(() => import('../pages/Modules/M1Marche/M1MarchePage.jsx'));
const M2IntelligenceIAPage = lazy(() => import('../pages/Modules/M2IntelligenceIA/M2IntelligenceIAPage.jsx'));
const M3FormationPage = lazy(() => import('../pages/Modules/M3Formation/M3FormationPage.jsx'));
const M4MeneurDeJeuPage = lazy(() => import('../pages/Modules/M4MeneurDeJeu/M4MeneurDeJeuPage.jsx'));
const M5StressTestingPage = lazy(() => import('../pages/Modules/M5StressTesting/M5StressTestingPage.jsx'));
const M6ActuariatPage = lazy(() => import('../pages/Modules/M6Actuariat/M6ActuariatPage.jsx'));

// Les chemins correspondent à `path` dans src/data/modules.js.
const PAGES = [
  { path: '/connexion', Page: SignInPage },
  { path: '/inscription', Page: SignUpPage },
  { path: '/marche', Page: M1MarchePage },
  { path: '/intelligence-ia', Page: M2IntelligenceIAPage },
  { path: '/formation', Page: M3FormationPage },
  { path: '/meneur-de-jeu', Page: M4MeneurDeJeuPage },
  { path: '/stress-testing', Page: M5StressTestingPage },
  { path: '/actuariat', Page: M6ActuariatPage },
];

// Point d'entrée unique pour toutes les routes de l'application.
// RouteLoader affiche l'écran de chargement (logo animé) à chaque changement
// de page ; le fallback de Suspense prend le relais si une page met du temps
// à se charger.
export default function AppRoutes() {
  return (
    <>
      <RouteLoader />
      <Routes>
        <Route path="/" element={<HomePage />} />
        {PAGES.map(({ path, Page }) => (
          <Route
            key={path}
            path={path}
            element={
              <Suspense fallback={<LoadingScreen layer="under" />}>
                <Page />
              </Suspense>
            }
          />
        ))}
      </Routes>
    </>
  );
}

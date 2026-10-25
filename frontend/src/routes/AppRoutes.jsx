import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import HomePage from '../pages/Home/HomePage.jsx';
import LoadingScreen from '../components/LoadingScreen/LoadingScreen.jsx';
import RouteLoader from '../components/RouteLoader/RouteLoader.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';

// Chargées à la demande (et non importées en haut du fichier) : ainsi, si une
// de ces pages (ou une de ses dépendances, ex. la config Supabase) a un
// souci, seule la route concernée est affectée — la home page reste servie
// normalement au lieu d'une page blanche pour toute l'app.
const SignInPage = lazy(() => import('../pages/SignIn/SignInPage.jsx'));
const SignUpPage = lazy(() => import('../pages/SignUp/SignUpPage.jsx'));
const ProfilePage = lazy(() => import('../pages/Profile/ProfilePage.jsx'));
const AdminUsersPage = lazy(() => import('../pages/Admin/AdminUsersPage.jsx'));

// Le module Portefeuille = une page = un dossier dans src/pages/Portefeuille/.
const PortefeuillePage = lazy(() => import('../pages/portefeuille/trading/M1MarchePage.jsx'));

// La route du module Portefeuille (anciennement M1 Marché — les autres
// modules ont été retirés du prototype). Les chemins correspondent à `path`
// dans src/data/modules.js.
const PAGES = [
  { path: '/connexion', Page: SignInPage },
  { path: '/inscription', Page: SignUpPage },
  { path: '/profil', Page: ProfilePage, protect: true },
  { path: '/admin/utilisateurs', Page: AdminUsersPage, protect: true, roles: ['admin'] },
  { path: '/marche', Page: PortefeuillePage },
  // Alias sémantique : le module s'appelle désormais « Portefeuille ».
  { path: '/portefeuille', Page: PortefeuillePage },
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
        {PAGES.map(({ path, Page, protect, roles }) => (
          <Route
            key={path}
            path={path}
            element={
              <Suspense fallback={<LoadingScreen layer="under" />}>
                {protect ? (
                  <ProtectedRoute roles={roles}>
                    <Page />
                  </ProtectedRoute>
                ) : (
                  <Page />
                )}
              </Suspense>
            }
          />
        ))}
      </Routes>
    </>
  );
}

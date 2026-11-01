import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import HomePage from '../pages/Home/HomePage.jsx';
import LoadingScreen from '../components/LoadingScreen/LoadingScreen.jsx';
import RouteLoader from '../components/RouteLoader/RouteLoader.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';

const SignInPage = lazy(() => import('../pages/SignIn/SignInPage.jsx'));
const SignUpPage = lazy(() => import('../pages/SignUp/SignUpPage.jsx'));
const ProfilePage = lazy(() => import('../pages/Profile/ProfilePage.jsx'));
const AdminUsersPage = lazy(() => import('../pages/Admin/AdminUsersPage.jsx'));

// Module 1 : Marché & Portefeuille (existant et inchangé)
const PortefeuillePage = lazy(() => import('../pages/portefeuille/trading/M1MarchePage.jsx'));

// Module 2 : Game Room — Salle de simulation pédagogique
const GameRoomPage = lazy(() => import('../pages/GameRoom/GameRoomPage.jsx'));

const PAGES = [
  { path: '/connexion', Page: SignInPage },
  { path: '/inscription', Page: SignUpPage },
  { path: '/profil', Page: ProfilePage, protect: true },
  { path: '/admin/utilisateurs', Page: AdminUsersPage, protect: true, roles: ['admin'] },
  { path: '/marche', Page: PortefeuillePage },
  { path: '/portefeuille', Page: PortefeuillePage },
  { path: '/game-room', Page: GameRoomPage },
];

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

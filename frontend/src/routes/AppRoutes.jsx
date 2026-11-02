import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import HomePage from '../pages/Home/HomePage.jsx';
import LoadingScreen from '../components/LoadingScreen/LoadingScreen.jsx';
import RouteLoader from '../components/RouteLoader/RouteLoader.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';
import { TRADING_ROLES } from '../data/roles.js';

const SignInPage = lazy(() => import('../pages/SignIn/SignInPage.jsx'));
const SignUpPage = lazy(() => import('../pages/SignUp/SignUpPage.jsx'));
const ProfilePage = lazy(() => import('../pages/Profile/ProfilePage.jsx'));
const AdminUsersPage = lazy(() => import('../pages/Admin/AdminUsersPage.jsx'));
const TeacherAiPage = lazy(() => import('../pages/ai/TeacherAiPage.jsx'));
const StudentAiPage = lazy(() => import('../pages/ai/StudentAiPage.jsx'));

// Module 1 : Marché & Portefeuille (existant et inchangé)
const PortefeuillePage = lazy(() => import('../pages/portefeuille/trading/M1MarchePage.jsx'));

// Module 2 : Game Room — Salle de simulation pédagogique
const GameRoomPage = lazy(() => import('../pages/GameRoom/GameRoomPage.jsx'));

const PAGES = [
  { path: '/connexion', Page: SignInPage },
  { path: '/inscription', Page: SignUpPage },
  { path: '/profil', Page: ProfilePage, protect: true },
  { path: '/admin/utilisateurs', Page: AdminUsersPage, protect: true, roles: ['admin'] },
  // Module IA : espace enseignant (meneur de jeu / admin) et bilans de l'étudiant.
  { path: '/ia/enseignant', Page: TeacherAiPage, protect: true, roles: ['game_master', 'admin'] },
  { path: '/ia/mes-bilans', Page: StudentAiPage, protect: true },
  { path: '/marche', Page: PortefeuillePage, protect: true, roles: TRADING_ROLES },
  // Alias sémantique : le module s'appelle désormais « Portefeuille ».
  { path: '/portefeuille', Page: PortefeuillePage, protect: true, roles: TRADING_ROLES },
  // Module 2 : Game Room
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

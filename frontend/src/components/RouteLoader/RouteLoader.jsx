import { useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import LoadingScreen from '../LoadingScreen/LoadingScreen.jsx';

const SHOW_MS = 1000; // durée minimale d'affichage de l'écran de chargement
const FADE_MS = 450; // durée du fondu de sortie (cf. LoadingScreen.css)

// Affiche l'écran de chargement à chaque changement de page (changement de
// chemin, pas de simple ancre #section) et remet la nouvelle page en haut.
export default function RouteLoader() {
  const { pathname } = useLocation();
  const previous = useRef(pathname);
  const [phase, setPhase] = useState('idle'); // idle | show | leaving

  useLayoutEffect(() => {
    if (previous.current === pathname) return undefined;
    previous.current = pathname;

    window.scrollTo(0, 0);
    setPhase('show');
    const leave = setTimeout(() => setPhase('leaving'), SHOW_MS);
    const done = setTimeout(() => setPhase('idle'), SHOW_MS + FADE_MS);
    return () => {
      clearTimeout(leave);
      clearTimeout(done);
    };
  }, [pathname]);

  if (phase === 'idle') return null;
  return <LoadingScreen leaving={phase === 'leaving'} />;
}

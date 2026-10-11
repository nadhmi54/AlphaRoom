import { useEffect, useState } from 'react';
import './BackToTop.css';

const SHOW_AFTER = 400; // px de défilement avant d'afficher le bouton

// Bouton flottant (logo AlphaRoom) qui ramène en haut de la page.
export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function goTop() {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }

  return (
    <button
      type="button"
      className={`ar-totop ${visible ? 'is-visible' : ''}`}
      onClick={goTop}
      aria-label="Retour en haut de la page"
      title="Retour en haut"
      tabIndex={visible ? 0 : -1}
    >
      <img src="/images/alpharoom-logo.png" alt="" width="34" height="34" />
    </button>
  );
}

import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Fait glisser un nombre vers sa nouvelle valeur au lieu de le remplacer d'un
 * coup : le grand chiffre du portefeuille « respire » à chaque mise à jour.
 */
export default function useAnimatedNumber(target, duration = 700) {
  const valid = typeof target === "number" && Number.isFinite(target);
  const [shown, setShown] = useState(valid ? target : 0);
  const current = useRef(valid ? target : 0);

  useEffect(() => {
    if (!valid) return undefined;
    const origin = current.current;
    if (origin === target || prefersReducedMotion()) {
      current.current = target;
      setShown(target);
      return undefined;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      const value = origin + (target - origin) * eased;
      current.current = value;
      setShown(value);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, valid]);

  return valid ? shown : target;
}

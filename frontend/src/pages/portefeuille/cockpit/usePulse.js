import { useEffect, useRef, useState } from "react";

const MAX_SAMPLES = 90;

/**
 * « Pouls » du portefeuille : mémorise la valeur totale à chaque mise à jour
 * (toutes les 5 s) pour dessiner une mini-courbe vivante pendant la session.
 */
export default function usePulse(value, stamp) {
  const [samples, setSamples] = useState([]);
  const last = useRef(null);

  useEffect(() => {
    if (typeof value !== "number" || !Number.isFinite(value) || !stamp) return;
    if (last.current === stamp) return;
    last.current = stamp;
    setSamples((current) => [...current, value].slice(-MAX_SAMPLES));
  }, [value, stamp]);

  return samples;
}

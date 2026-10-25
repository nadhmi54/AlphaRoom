import { useEffect } from "react";

const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * Raccourcis clavier d'une lettre ou d'un chiffre. Ignorés quand on tape dans
 * un champ ou qu'une touche de modification (Ctrl, Alt, Cmd) est enfoncée.
 * `handlers` : { f: () => ..., "1": () => ... } (touches en minuscules).
 */
export default function useShortcuts(handlers) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target && (TYPING.has(target.tagName) || target.isContentEditable)) return;
      const handler = handlers[event.key.toLowerCase()];
      if (!handler) return;
      handler(event);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}

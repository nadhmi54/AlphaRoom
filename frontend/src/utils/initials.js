// Initiales (max. 2) d'un nom, d'un pseudo ou d'une adresse e-mail.
export function initialsOf(text) {
  return (
    String(text ?? '')
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('') || '?'
  );
}

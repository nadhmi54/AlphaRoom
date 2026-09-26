// Point d'entrée unique pour les variables d'environnement Vite (VITE_*).
// Les composants et services importent depuis ici plutôt que de lire
// `import.meta.env` un peu partout dans le code.

export const API_URL = import.meta.env.VITE_API_URL || '/api';

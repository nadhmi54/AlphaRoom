import { createContext } from 'react';

// Valeur par défaut = "personne n'est connecté" : les composants qui lisent le
// contexte (ex. UserMenu) restent utilisables sans provider, notamment en test.
export const AuthContext = createContext({
  session: null,
  profile: null,
  loading: false,
  profileError: null,
  refreshProfile: async () => {},
  updateProfile: async () => {
    throw new Error("AuthProvider manquant.");
  },
  signOut: async () => {},
});

/**
 * Rôles métier d'AlphaRoom (cf. README : les métiers d'une salle de marché).
 * Le rôle est stocké dans la table `profiles` — jamais lu depuis le JWT, dont
 * le champ `role` désigne uniquement le rôle Postgres de Supabase
 * ("authenticated"). Seul un administrateur peut modifier le rôle d'un compte.
 */
export enum UserRole {
  TRADER = 'trader',
  GAME_MASTER = 'game_master',
  ADMIN = 'admin',
}

export const USER_ROLES: UserRole[] = Object.values(UserRole);

/**
 * Rôles autorisés sur M1 (marché, carnet d'ordres, portefeuille) : tout le
 * monde sauf le meneur de jeu, qui n'intervient que dans la Game Room.
 * Dérivé de `USER_ROLES` pour rester exact si un rôle est ajouté.
 */
export const TRADING_ROLES: UserRole[] = USER_ROLES.filter(
  (role) => role !== UserRole.GAME_MASTER,
);

/**
 * Rôles autorisés à piloter une Game Room : le meneur de jeu et l'administrateur.
 * Un étudiant ne peut ni créer, ni configurer, ni contrôler une séance.
 */
export const MASTER_ROLES: UserRole[] = [UserRole.GAME_MASTER, UserRole.ADMIN];

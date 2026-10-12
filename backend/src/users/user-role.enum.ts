/**
 * Rôles métier d'AlphaRoom (cf. README : les métiers d'une salle de marché).
 * Le rôle est stocké dans la table `profiles` — jamais lu depuis le JWT, dont
 * le champ `role` désigne uniquement le rôle Postgres de Supabase
 * ("authenticated"). Seul un administrateur peut modifier le rôle d'un compte.
 */
export enum UserRole {
  TRADER = 'trader',
  ANALYST = 'analyst',
  TRAINER = 'trainer',
  GAME_MASTER = 'game_master',
  RISK_MANAGER = 'risk_manager',
  ADMIN = 'admin',
}

export const USER_ROLES: UserRole[] = Object.values(UserRole);

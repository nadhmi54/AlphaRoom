/**
 * Shape of the payload Supabase Auth puts in the JWT it issues on login.
 * Only the fields we actually use are declared here; the real token has more.
 */
export interface SupabaseJwtPayload {
  sub: string; // Supabase user id (uuid)
  email?: string;
  role?: string; // Postgres role, usually "authenticated"
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  exp: number;
  iat: number;
}

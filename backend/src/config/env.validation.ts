import { plainToInstance } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, validateSync } from 'class-validator';

/**
 * Validates the process environment at boot time so a missing/misspelled
 * variable fails fast with a clear error instead of crashing later, deep
 * inside a request handler.
 */
class EnvironmentVariables {
  @IsOptional()
  @IsNumber()
  PORT?: number;

  // Supabase-hosted (or local, via `supabase start`) PostgreSQL connection
  // string, e.g. postgresql://postgres:postgres@localhost:54322/postgres
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  // Verifies JWTs issued by Supabase Auth (Project Settings > API > JWT Secret,
  // or printed by `supabase start` for local dev).
  @IsString()
  @IsNotEmpty()
  SUPABASE_JWT_SECRET!: string;

  @IsOptional()
  @IsString()
  SUPABASE_URL?: string;

  @IsOptional()
  @IsString()
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(
      `Configuration invalide :\n${errors
        .map((e) => Object.values(e.constraints ?? {}).join(', '))
        .join('\n')}`,
    );
  }

  return validated;
}

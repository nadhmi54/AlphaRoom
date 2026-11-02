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

  // Clé gratuite finnhub.io : flux temps réel des actions (AAPL). Sans elle,
  // les actions restent en simulation.
  @IsOptional()
  @IsString()
  FINNHUB_API_KEY?: string;

  // "false" coupe le service de prix en temps réel.
  @IsOptional()
  @IsString()
  MARKET_DATA_ENABLED?: string;

  // Module IA : "stub" (par défaut, aucune requête externe) ou "anthropic" ou "openai-compat" (Groq, Gemini, OpenRouter, Ollama…).
  @IsOptional()
  @IsString()
  AI_PROVIDER?: string;

  // Clé du fournisseur : uniquement dans backend/.env, jamais dans git.
  @IsOptional()
  @IsString()
  ANTHROPIC_API_KEY?: string;

  // Clé du fournisseur « openai-compat » (jamais dans git) et adresse de son API.
  @IsOptional()
  @IsString()
  AI_API_KEY?: string;

  @IsOptional()
  @IsString()
  AI_BASE_URL?: string;

  // Identifiant du modèle utilisé quand AI_PROVIDER n'est pas "stub".
  @IsOptional()
  @IsString()
  AI_MODEL?: string;

  // Source des séances pour le module IA : "demo" (séance fictive) ou absent
  // (simulation non branchée).
  @IsOptional()
  @IsString()
  AI_SESSION_SOURCE?: string;

  // Mode démo : identifiant (uuid) d'un compte trader qui prend la place de
  // l'étudiant fictif « Amine », pour tester l'écran étudiant et le coach.
  @IsOptional()
  @IsString()
  AI_DEMO_STUDENT_ID?: string;
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

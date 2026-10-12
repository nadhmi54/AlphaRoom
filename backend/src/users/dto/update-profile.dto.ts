import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class PreferencesDto {
  @IsOptional()
  @IsIn(['fr', 'en'], { message: 'Langue non supportée (fr ou en).' })
  language?: 'fr' | 'en';

  @IsOptional()
  @IsIn(['dark', 'light'], { message: 'Thème non supporté (dark ou light).' })
  theme?: 'dark' | 'light';
}

/**
 * Champs qu'un utilisateur peut modifier sur son propre profil. Le rôle, le
 * statut et l'email n'y figurent volontairement pas (whitelist du
 * ValidationPipe : tout champ inconnu est ignoré).
 * Envoyer `null` efface le pseudo, l'avatar ou le pays.
 */
export class UpdateProfileDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 80, { message: 'Le nom doit contenir entre 2 et 80 caractères.' })
  fullName?: string;

  @IsOptional()
  @Transform(lower)
  @Matches(/^[a-z0-9_.-]{3,30}$/, {
    message: 'Pseudo invalide : 3 à 30 caractères (lettres, chiffres, _ . -).',
  })
  username?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: "L'avatar doit être une URL https." })
  @MaxLength(500)
  avatarUrl?: string | null;

  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z]{2}$/, { message: 'Pays invalide (code ISO sur 2 lettres, ex. TN).' })
  country?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => PreferencesDto)
  preferences?: PreferencesDto;
}

import { Expose } from 'class-transformer';

/**
 * Badge du catalogue : niveau (Débutant...Expert), compétence ou réussite.
 * Tous les badges sont attribués par le moteur de règles — jamais par le client.
 */
export class BadgeDto {
  @Expose() id!: string;
  @Expose() code!: string;
  @Expose() kind!: 'level' | 'skill' | 'achievement';
  @Expose() title!: string;
  @Expose() description!: string | null;
  @Expose() icon!: string | null;
  @Expose() position!: number;
}

/** Badge obtenu par le joueur, accompagné de sa date d'obtention. */
export class UserBadgeDto extends BadgeDto {
  @Expose() awardedAt!: Date;
  @Expose() ruleId!: string | null;
}

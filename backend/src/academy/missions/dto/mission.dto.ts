import { Expose } from 'class-transformer';
import type { MissionCriteria } from '../mission-criteria.js';

/**
 * Mission telle qu'elle est présentée à l'élève : ses critères sont visibles
 * pour qu'il sache ce qui est attendu, ainsi que sa fenêtre de validité et son
 * état d'ouverture.
 */
export class MissionDto {
  @Expose() id!: string;
  @Expose() code!: string;
  @Expose() level!: number;
  @Expose() title!: string;
  @Expose() description!: string | null;
  @Expose() scenarioId!: string | null;
  @Expose() criteria!: MissionCriteria;
  @Expose() isPlacement!: boolean;
  @Expose() startsAt!: Date | null;
  @Expose() endsAt!: Date | null;
  @Expose() open!: boolean;
  @Expose() state!: 'locked' | 'available' | 'passed';
  @Expose() unlockCondition!: string;
}

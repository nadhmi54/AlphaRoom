import { IsIn, IsOptional } from 'class-validator';

export const POSITION_STATUSES = ['open', 'closed', 'all'] as const;
export type PositionStatusFilter = (typeof POSITION_STATUSES)[number];

export class PositionsQueryDto {
  /** `open` : positions détenues ; `closed` : cycles soldés ; `all` (défaut) : les deux. */
  @IsOptional()
  @IsIn(POSITION_STATUSES)
  status?: PositionStatusFilter;
}

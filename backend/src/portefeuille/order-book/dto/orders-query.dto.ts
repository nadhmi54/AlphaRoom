import { IsIn, IsOptional } from 'class-validator';
import type { OrderStatus } from '../order.entity.js';

export class OrdersQueryDto {
  @IsOptional()
  @IsIn(['open', 'partially_filled', 'filled', 'cancelled'])
  status?: OrderStatus;
}

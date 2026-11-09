import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** XP et niveau d'un joueur (une ligne par profil). */
@Entity({ name: 'academy_user_stats' })
export class AcademyUserStats {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ type: 'int', default: 0 }) xp!: number;
  @Column({ type: 'int', default: 1 }) level!: number;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

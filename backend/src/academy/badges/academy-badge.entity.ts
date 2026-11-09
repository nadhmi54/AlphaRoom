import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Badge : niveau (Débutant...Expert), compétence (« Risque niveau 2 ») ou réussite. */
@Entity({ name: 'academy_badges' })
export class AcademyBadge {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 64, unique: true }) code!: string;
  @Column({ type: 'varchar', length: 16 }) kind!: 'level' | 'skill' | 'achievement';
  @Column({ type: 'varchar', length: 160 }) title!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) icon!: string | null;
  @Column({ type: 'int', default: 0 }) position!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Progression d'un joueur sur une leçon (et, par agrégation, par cours/compétence).
 * `score` porte le résultat du quiz associé quand il y en a un.
 */
@Entity({ name: 'academy_user_progress' })
@Index('idx_academy_user_progress_user', ['userId', 'courseId'])
@Index('uq_academy_user_progress_user_lesson', ['userId', 'lessonId'], { unique: true })
export class AcademyUserProgress {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'course_id', type: 'uuid' }) courseId!: string;
  @Column({ name: 'lesson_id', type: 'uuid' }) lessonId!: string;
  @Column({ type: 'varchar', length: 16, default: 'not_started' })
  status!: 'not_started' | 'in_progress' | 'completed';
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true }) score!: string | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

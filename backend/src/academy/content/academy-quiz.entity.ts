import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Quiz rattaché à un cours et/ou une leçon. `passThreshold` est le seuil de
 * réussite en pourcentage (70 % par défaut), configurable par l'administrateur.
 */
@Entity({ name: 'academy_quizzes' })
@Index('idx_academy_quizzes_course', ['courseId'])
@Index('idx_academy_quizzes_lesson', ['lessonId'])
export class AcademyQuiz {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'course_id', type: 'uuid', nullable: true }) courseId!: string | null;
  @Column({ name: 'lesson_id', type: 'uuid', nullable: true }) lessonId!: string | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) code!: string | null;
  @Column({ type: 'varchar', length: 160 }) title!: string;
  @Column({ name: 'pass_threshold', type: 'numeric', precision: 5, scale: 2, default: 70 }) passThreshold!: string;
  @Column({ type: 'int', default: 0 }) position!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

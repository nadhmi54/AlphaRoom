import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Leçon d'un cours : texte, vidéo (par URL externe) ou lien. */
@Entity({ name: 'academy_lessons' })
@Index('idx_academy_lessons_course', ['courseId'])
@Index('uq_academy_lessons_course_position', ['courseId', 'position'], { unique: true })
export class AcademyLesson {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'course_id', type: 'uuid' }) courseId!: string;
  @Column({ type: 'varchar', length: 64, nullable: true }) code!: string | null;
  @Column({ type: 'varchar', length: 160 }) title!: string;
  @Column({ type: 'varchar', length: 16, default: 'text' }) kind!: 'text' | 'video' | 'link';
  @Column({ type: 'text', nullable: true }) content!: string | null;
  @Column({ name: 'video_url', type: 'varchar', length: 500, nullable: true }) videoUrl!: string | null;
  @Column({ name: 'duration_minutes', type: 'int', default: 0 }) durationMinutes!: number;
  @Column({ type: 'int', default: 0 }) position!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Question d'un quiz. `options` est un tableau JSON de choix et `correctIndex`
 * l'indice de la bonne réponse (jamais exposé à l'étudiant avant correction).
 */
@Entity({ name: 'academy_quiz_questions' })
@Index('idx_academy_quiz_questions_quiz', ['quizId'])
@Index('uq_academy_quiz_questions_quiz_position', ['quizId', 'position'], { unique: true })
export class AcademyQuizQuestion {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'quiz_id', type: 'uuid' }) quizId!: string;
  @Column({ type: 'int', default: 0 }) position!: number;
  @Column({ type: 'text' }) prompt!: string;
  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` }) options!: string[];
  @Column({ name: 'correct_index', type: 'int' }) correctIndex!: number;
  @Column({ type: 'text', nullable: true }) explanation!: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

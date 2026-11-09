import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Cours de l'Academy : contenu de base (débloqué par la progression) ou contenu
 * avancé/premium (débloqué par une victoire). `unlockHint` décrit la condition de
 * déblocage affichée même quand le cours est verrouillé.
 */
@Entity({ name: 'academy_courses' })
export class AcademyCourse {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 64, unique: true }) code!: string;
  @Column({ type: 'varchar', length: 160 }) title!: string;
  @Column({ type: 'text', nullable: true }) summary!: string | null;
  @Column({ type: 'int', default: 1 }) level!: number;
  @Column({ name: 'is_premium', type: 'boolean', default: false }) isPremium!: boolean;
  @Column({ name: 'unlock_hint', type: 'text', nullable: true }) unlockHint!: string | null;
  @Column({ type: 'int', default: 0 }) position!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

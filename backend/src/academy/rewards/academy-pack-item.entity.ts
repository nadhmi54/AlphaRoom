import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Appartenance ordonnée d'un cours à un pack de récompense. */
@Entity({ name: 'academy_pack_items' })
@Index('idx_academy_pack_items_pack', ['packId'])
@Index('uq_academy_pack_items_pack_course', ['packId', 'courseId'], { unique: true })
export class AcademyPackItem {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'pack_id', type: 'uuid' }) packId!: string;
  @Column({ name: 'course_id', type: 'uuid' }) courseId!: string;
  @Column({ type: 'int', default: 0 }) position!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

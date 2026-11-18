import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Pack de cours avancés regroupés pour une récompense. */
@Entity({ name: 'academy_packs' })
export class AcademyPack {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 64, unique: true }) code!: string;
  @Column({ type: 'varchar', length: 160 }) title!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ name: 'is_premium', type: 'boolean', default: true }) isPremium!: boolean;
  @Column({ type: 'int', default: 0 }) position!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

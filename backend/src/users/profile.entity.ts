import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { UserRole } from './user-role.enum.js';

export interface UserPreferences {
  language: 'fr' | 'en';
  theme: 'dark' | 'light';
}

export const DEFAULT_PREFERENCES: UserPreferences = { language: 'fr', theme: 'dark' };

/**
 * Profil applicatif d'un utilisateur. `id` est l'identifiant du compte
 * Supabase Auth (claim `sub` du JWT) : Supabase gère l'identité et les mots de
 * passe, cette table porte tout ce qui est propre à AlphaRoom (rôle, statut,
 * préférences...).
 */
@Entity({ name: 'profiles' })
export class Profile {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 80, nullable: true })
  fullName!: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 30, nullable: true })
  username!: string | null;

  @Column({ name: 'avatar_url', type: 'varchar', length: 500, nullable: true })
  avatarUrl!: string | null;

  @Column({ type: 'char', length: 2, nullable: true })
  country!: string | null;

  @Column({ type: 'varchar', length: 20, default: UserRole.TRADER })
  role!: UserRole;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'jsonb', default: () => `'{"language":"fr","theme":"dark"}'` })
  preferences!: UserPreferences;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get<string>('DATABASE_URL', '');
        const databaseHost = new URL(databaseUrl).hostname;
        const isHostedSupabase =
          databaseHost.endsWith('.supabase.co') ||
          databaseHost.endsWith('.pooler.supabase.com');

        return {
          type: 'postgres' as const,
          url: databaseUrl,
          autoLoadEntities: true,
          // Hosted Supabase direct and pooled connections use SSL. The local
          // Supabase CLI connection on localhost does not.
          ssl: isHostedSupabase ? { rejectUnauthorized: false } : false,
          // Le schéma appartient à `supabase/migrations/`, pas aux entités :
          // la synchronisation automatique recréait les tables sans clés
          // étrangères, contraintes CHECK ni index (voir
          // `20261025120000_schema_integrity.sql`). Après une modification
          // d'entité, écrire une migration puis `supabase migration up`
          // (local) ou `supabase db push` (projet Cloud).
          synchronize: false,
        };
      },
    }),
  ],
})
export class DatabaseModule {}

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
          // Convenient while entities don't exist yet; switch to migrations
          // once real tables/business modules are added.
          synchronize: process.env.NODE_ENV !== 'production',
        };
      },
    }),
  ],
})
export class DatabaseModule {}

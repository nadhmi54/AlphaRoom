import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        autoLoadEntities: true,
        // Supabase's pooled connection (pgbouncer, port 6543) requires SSL;
        // the local Supabase stack (`supabase start`) does not.
        ssl: config.get<string>('DATABASE_URL', '').includes('supabase.co')
          ? { rejectUnauthorized: false }
          : false,
        // Convenient while entities don't exist yet; switch to migrations
        // once real tables/business modules are added.
        synchronize: process.env.NODE_ENV !== 'production',
      }),
    }),
  ],
})
export class DatabaseModule {}

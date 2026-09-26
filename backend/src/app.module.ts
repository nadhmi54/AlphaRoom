import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    // Domain modules (marché & exécution, portefeuille & risque, IA,
    // stress testing...) plug in here as they're built — see the README's
    // "Modules fonctionnels" table for the 6 modules this maps to.
  ],
})
export class AppModule {}

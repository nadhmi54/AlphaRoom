import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller.js';
import { SupabaseJwtGuard } from './supabase-jwt.guard.js';

@Module({
  imports: [ConfigModule],
  controllers: [AuthController],
  providers: [SupabaseJwtGuard],
  exports: [SupabaseJwtGuard],
})
export class AuthModule {}

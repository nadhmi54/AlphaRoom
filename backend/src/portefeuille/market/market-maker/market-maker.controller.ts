import { Controller, Get, Post } from '@nestjs/common';
import { Auth } from '../../../users/auth.decorator.js';
import { MarketMakerService } from './market-maker.service.js';

@Auth()
@Controller('market/maker')
export class MarketMakerController {
  constructor(private readonly maker: MarketMakerService) {}

  @Get('status')
  getStatus() {
    return this.maker.getStatus();
  }

  @Post('start')
  start() {
    this.maker.start();
    return { status: 'started' };
  }

  @Post('stop')
  stop() {
    this.maker.stop();
    return { status: 'stopped' };
  }
}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameRoom } from './entities/game-room.entity.js';
import { GameParticipant } from './entities/game-participant.entity.js';
import { SimulationPortfolio } from './entities/sim-portfolio.entity.js';
import { SimulationPosition } from './entities/sim-position.entity.js';
import { SimulationOrder } from './entities/sim-order.entity.js';
import { SimulationTrade } from './entities/sim-trade.entity.js';
import { GameEvent } from './entities/game-event.entity.js';
import { GameSnapshot } from './entities/game-snapshot.entity.js';
import { Profile } from '../users/profile.entity.js';
import { GameRoomService } from './services/game-room.service.js';
import { SimulationEngineService } from './services/simulation-engine.service.js';
import { GameRoomAiService } from './services/game-room-ai.service.js';
import { GameRoomController } from './game-room.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GameRoom,
      GameParticipant,
      SimulationPortfolio,
      SimulationPosition,
      SimulationOrder,
      SimulationTrade,
      GameEvent,
      GameSnapshot,
      Profile,
    ]),
  ],
  controllers: [GameRoomController],
  providers: [GameRoomService, SimulationEngineService, GameRoomAiService],
  exports: [GameRoomService, SimulationEngineService],
})
export class GameRoomModule {}

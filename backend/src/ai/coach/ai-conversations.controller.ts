import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { Auth } from '../../users/auth.decorator.js';
import { CurrentProfile } from '../../users/current-profile.decorator.js';
import type { Profile } from '../../users/profile.entity.js';
import type { AiConversationMessage } from '../storage/ai-conversation-message.entity.js';
import type { AiConversation } from '../storage/ai-conversation.entity.js';
import { RenameConversationDto } from './ai-coach.dto.js';
import { AiConversationsService } from './ai-conversations.service.js';

const view = (c: AiConversation) => ({
  id: c.id,
  title: c.title,
  sessionId: c.sessionId,
  messageCount: c.messageCount,
  hasSummary: c.summary !== null && c.summary !== '',
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

const messageView = (m: AiConversationMessage) => ({ id: m.id, role: m.role, content: m.content, meta: m.meta, createdAt: m.createdAt });

/** Discussions du coach : chacun ne voit que les siennes. */
@Controller('ai/conversations')
export class AiConversationsController {
  constructor(@Inject(AiConversationsService) private readonly service: AiConversationsService) {}

  @Auth()
  @Get()
  async list(@CurrentProfile() profile: Profile) {
    return { conversations: (await this.service.list(profile.id)).map(view) };
  }

  @Auth()
  @Get(':id')
  async get(@CurrentProfile() profile: Profile, @Param('id', ParseUUIDPipe) id: string) {
    const { conversation, messages } = await this.service.get(profile.id, id);
    return { conversation: view(conversation), messages: messages.map(messageView) };
  }

  @Auth()
  @Patch(':id')
  async rename(@CurrentProfile() profile: Profile, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RenameConversationDto) {
    return { conversation: view(await this.service.rename(profile.id, id, dto.title)) };
  }

  @Auth()
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentProfile() profile: Profile, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.service.remove(profile.id, id);
  }
}

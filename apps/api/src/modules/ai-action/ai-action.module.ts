import { Module } from '@nestjs/common'
import { AiActionGateway } from './ai-action.gateway'
import { PrismaAiActionStore } from './ai-action.prisma.store'
import { PrismaAiActionTargetAuthority } from './ai-action.prisma.target-authority'
import { AI_ACTION_STORE } from './ai-action.store'
import { AI_ACTION_TARGET_AUTHORITY } from './ai-action.target'

@Module({
  providers: [
    {
      provide: AI_ACTION_STORE,
      useClass: PrismaAiActionStore,
    },
    {
      provide: AI_ACTION_TARGET_AUTHORITY,
      useClass: PrismaAiActionTargetAuthority,
    },
    AiActionGateway,
  ],
  exports: [AiActionGateway],
})
export class AiActionModule {}

import { Module } from '@nestjs/common'
import { AiActionGateway } from './ai-action.gateway'
import { PrismaAiActionStore } from './ai-action.prisma.store'
import { AI_ACTION_STORE } from './ai-action.store'

@Module({
  providers: [
    {
      provide: AI_ACTION_STORE,
      useClass: PrismaAiActionStore,
    },
    AiActionGateway,
  ],
  exports: [AiActionGateway],
})
export class AiActionModule {}

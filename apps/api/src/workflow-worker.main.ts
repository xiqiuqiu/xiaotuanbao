import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { AiWorkflowProcessor } from './modules/ai-create-task/ai-workflow.processor'

const POLL_IDLE_MS = 500
const POLL_BUSY_MS = 50
const BATCH_LIMIT = 5

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  })
  const processor = app.get(AiWorkflowProcessor)
  const logger = new Logger('WorkflowWorker')
  logger.log('AI 工作流 Worker 已启动')

  let stopping = false
  const stop = async () => {
    if (stopping) {
      return
    }
    stopping = true
    logger.log('正在停止 AI 工作流 Worker')
    await app.close()
    process.exit(0)
  }
  process.on('SIGINT', () => {
    void stop()
  })
  process.on('SIGTERM', () => {
    void stop()
  })

  while (!stopping) {
    const processed = await processor.processDueJobs(BATCH_LIMIT)
    await sleep(processed > 0 ? POLL_BUSY_MS : POLL_IDLE_MS)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

bootstrap().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})

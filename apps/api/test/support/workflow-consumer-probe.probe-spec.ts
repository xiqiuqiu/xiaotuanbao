import { NestFactory } from '@nestjs/core'
import { AppModule } from '../../src/app.module'
import { AiWorkflowProcessor } from '../../src/modules/ai-create-task/ai-workflow.processor'

describe('one-shot workflow consumer probe', () => {
  it('processes the expected number of jobs from its configured schema', async () => {
    const expected = Number(process.env.XIAOTUANBAO_E2E_EXPECTED_PROCESSED)
    if (!Number.isInteger(expected) || expected < 0) {
      throw new Error('XIAOTUANBAO_E2E_EXPECTED_PROCESSED must be a non-negative integer')
    }

    const app = await NestFactory.createApplicationContext(AppModule, { logger: false })
    try {
      await expect(app.get(AiWorkflowProcessor).processDueJobs(1)).resolves.toBe(expected)
    } finally {
      await app.close()
    }
  })
})

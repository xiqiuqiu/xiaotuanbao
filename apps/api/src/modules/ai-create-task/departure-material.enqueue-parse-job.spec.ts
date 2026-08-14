import {
  AiWorkflowJobStatus,
  AiWorkflowJobType,
  type Prisma,
} from '@prisma/client'
import { WORKFLOW_MAX_ATTEMPTS } from './ai-conversation.constants'
import { materialParseJobKey } from './departure-material.constants'
import { DepartureMaterialService } from './departure-material.service'

type JobRow = {
  id: string
  jobKey: string
  status: AiWorkflowJobStatus
  attemptCount: number
  inputBatchId: string
  conversationId: string
  lastErrorCode: string | null
  claimedAt: Date | null
  claimedBy: string | null
  leaseExpiresAt: Date | null
  nextAttemptAt: Date
  organizationId: string
  taskId: string
  materialId: string
  type: AiWorkflowJobType
}

const params = {
  organizationId: 'org-1',
  taskId: 'task-1',
  conversationId: 'conv-1',
  inputBatchId: 'batch-new',
  materialId: 'mat-1',
}

function createStore(initial: JobRow | null) {
  let job: JobRow | null = initial ? { ...initial } : null

  const matches = (where: {
    id?: string
    jobKey?: string
    status?: AiWorkflowJobStatus | { in?: AiWorkflowJobStatus[] }
  }) => {
    if (!job) {
      return false
    }
    if (where.id && job.id !== where.id) {
      return false
    }
    if (where.jobKey && job.jobKey !== where.jobKey) {
      return false
    }
    if (where.status) {
      if (typeof where.status === 'object' && where.status.in) {
        return where.status.in.includes(job.status)
      }
      return job.status === where.status
    }
    return true
  }

  const api = {
    findUnique: async ({ where }: { where: { id?: string; jobKey?: string } }) =>
      matches(where) ? { ...job! } : null,
    create: async ({ data }: { data: Partial<JobRow> }) => {
      job = {
        id: 'job-1',
        attemptCount: 0,
        lastErrorCode: null,
        claimedAt: null,
        claimedBy: null,
        leaseExpiresAt: null,
        nextAttemptAt: new Date('2026-08-14T00:00:00.000Z'),
        type: AiWorkflowJobType.material_parse,
        jobKey: materialParseJobKey(params.materialId),
        organizationId: params.organizationId,
        taskId: params.taskId,
        conversationId: params.conversationId,
        inputBatchId: params.inputBatchId,
        materialId: params.materialId,
        status: AiWorkflowJobStatus.pending,
        ...data,
      }
      return { ...job }
    },
    update: async ({ data }: { where: { id: string }; data: Partial<JobRow> }) => {
      job = { ...job!, ...data }
      return { ...job }
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { jobKey: string }
      create: Partial<JobRow>
      update: Partial<JobRow>
    }) => {
      if (!job || job.jobKey !== where.jobKey) {
        return api.create({ data: create })
      }
      job = { ...job, ...update }
      return { ...job }
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: {
        jobKey?: string
        status?: AiWorkflowJobStatus | { in?: AiWorkflowJobStatus[] }
      }
      data: Partial<JobRow>
    }) => {
      if (!matches(where)) {
        return { count: 0 }
      }
      job = { ...job!, ...data }
      return { count: 1 }
    },
  }

  return {
    tx: { aiWorkflowJob: api } as unknown as Prisma.TransactionClient,
    getJob: () => (job ? { ...job } : null),
  }
}

function terminalJob(status: AiWorkflowJobStatus): JobRow {
  return {
    id: 'job-1',
    jobKey: materialParseJobKey(params.materialId),
    status,
    attemptCount: WORKFLOW_MAX_ATTEMPTS,
    inputBatchId: 'batch-old',
    conversationId: 'conv-1',
    lastErrorCode: 'PARSE_FAILED',
    claimedAt: new Date('2026-08-14T00:00:00.000Z'),
    claimedBy: 'worker-1',
    leaseExpiresAt: null,
    nextAttemptAt: new Date('2026-08-14T00:00:00.000Z'),
    organizationId: params.organizationId,
    taskId: params.taskId,
    materialId: params.materialId,
    type: AiWorkflowJobType.material_parse,
  }
}

describe('DepartureMaterialService.enqueueParseJob', () => {
  const service = new DepartureMaterialService({} as never, {} as never, {} as never)

  it('requeues a failed parse job onto the new waiting batch', async () => {
    const { tx, getJob } = createStore(terminalJob(AiWorkflowJobStatus.failed))

    await service.enqueueParseJob(tx, params)

    expect(getJob()).toMatchObject({
      status: AiWorkflowJobStatus.pending,
      attemptCount: 0,
      inputBatchId: 'batch-new',
      lastErrorCode: null,
      claimedAt: null,
      claimedBy: null,
      leaseExpiresAt: null,
    })
  })

  it('requeues a succeeded parse job when the material still needs parsing', async () => {
    const { tx, getJob } = createStore(terminalJob(AiWorkflowJobStatus.succeeded))

    await service.enqueueParseJob(tx, params)

    expect(getJob()).toMatchObject({
      status: AiWorkflowJobStatus.pending,
      attemptCount: 0,
      inputBatchId: 'batch-new',
    })
  })

  it('leaves an in-flight parse job unchanged', async () => {
    const existing = {
      ...terminalJob(AiWorkflowJobStatus.claimed),
      attemptCount: 1,
      lastErrorCode: null,
      inputBatchId: 'batch-old',
    }
    const { tx, getJob } = createStore(existing)

    await service.enqueueParseJob(tx, params)

    expect(getJob()).toEqual(existing)
  })
})

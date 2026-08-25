import {
  AI_CREATE_AGENT_DEFINITION_REF,
  AI_CREATE_CAPABILITY_REFS_BY_TOOL,
  type SubmitReviewPackageModelInput,
} from '@xiaotuanbao/ai-contracts'
import { AiActionGateway } from '../ai-action/ai-action.gateway'
import { InMemoryAiActionStore } from '../ai-action/ai-action.in-memory.store'
import type { AiActionActor, AiActionForwardContext } from '../ai-action/ai-action.types'
import { AiToolWorkerAdapter } from './ai-tool-worker.adapter'

const actor: AiActionActor = {
  organizationId: 'org-1',
  userId: 'user-1',
  taskId: 'task-1',
  conversationId: 'conv-1',
  inputBatchId: 'batch-1',
  runId: 'run-1',
  attemptId: 'attempt-1',
  contextManifestId: 'manifest-1',
  agentDefinition: AI_CREATE_AGENT_DEFINITION_REF,
  grantedCapabilities: Object.values(AI_CREATE_CAPABILITY_REFS_BY_TOOL),
}

const reviewInput: SubmitReviewPackageModelInput = {
  objectVersion: 1,
  confirmationUnit: 'basic_info_draft',
  candidates: [
    {
      fieldKey: 'name',
      proposedValue: '候选团名-含证件号110101199001011234',
      clarity: 'clear',
      evidence: [{ kind: 'user_message', excerpt: '护照页原文 E12345678', sequence: 1 }],
    },
  ],
}

describe('AiToolWorkerAdapter.projectReviewPackage', () => {
  it('leaves a review AI action before forwarding the existing projection', async () => {
    const store = new InMemoryAiActionStore()
    const adapter = new AiToolWorkerAdapter(new AiActionGateway(store))
    const forwarded: Array<{ actionId: string | undefined; packageId: string }> = []

    const result = await adapter.projectReviewPackage({
      actor,
      input: reviewInput,
      persist: async ({ action }: AiActionForwardContext) => {
        forwarded.push({ actionId: action?.id, packageId: 'pkg-1' })
        return 'pkg-1'
      },
    })

    expect(result.reviewPackageId).toBe('pkg-1')
    expect(forwarded).toEqual([{ actionId: store.records[0]?.id, packageId: 'pkg-1' }])
    expect(result.action).toMatchObject({
      name: 'proposeReviewPackage',
      kind: 'write',
      decision: 'review',
      reasonCode: 'OBSERVATION_PERIOD',
      executionStatus: 'succeeded',
      targetRef: { kind: 'departure_creation_draft', id: 'task-1' },
    })
    expect(result.action?.candidateFieldKeys).toEqual(['name'])
    expect(JSON.stringify(result.action)).not.toContain('110101199001011234')
    expect(JSON.stringify(result.action)).not.toContain('护照页原文')
  })
})

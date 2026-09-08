import { AiCreateTaskService } from './ai-create-task.service'
import { DepartureMaterialService } from './departure-material.service'

const caller = { organizationId: 'org-1', userId: 'user-1', taskId: 'task-1', runId: 'run-1', conversationId: 'chat-1', inputBatchId: 'batch-1' }
const input = { taskId: caller.taskId, runId: caller.runId, materialId: 'source-1', parseResultVersion: 1 }
function setup(type = 'departure_creation', formal = true) {
  const task = { id: caller.taskId, organizationId: caller.organizationId, ownerUserId: caller.userId, type, departureId: formal ? 'departure-1' : null }
  const prisma = {
    agentTask: { findFirst: jest.fn().mockResolvedValue(task) },
    aiCreateTask: { findFirst: jest.fn().mockResolvedValue({ agentTask: task, draft: {}, departureId: task.departureId }) },
    aiAgentAttempt: { findFirst: jest.fn().mockResolvedValue({ id: caller.runId }) },
    inputBatchSource: { findFirst: jest.fn().mockResolvedValue({ sourceId: input.materialId }) },
    conversationSource: { findFirst: jest.fn().mockResolvedValue(null) },
    conversationSourceParseRun: { findFirst: jest.fn().mockResolvedValue({ resultVersion: 1, pages: [{ pageNumber: 1, source: 'ocr', text: '客人甲 客人乙' }] }) },
  }
  const materials = new DepartureMaterialService(prisma as never, {} as never, {} as never)
  const service = new AiCreateTaskService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, materials)
  return { service, prisma, task }
}
describe('material reads belong to conversation, independent of departure lifecycle', () => {
  it.each([['departure_creation', false], ['departure_creation', true], ['departure_collaboration', true]])('reads pinned OCR for %s, formal=%s without a creation draft', async (type, formal) => {
    const { service, prisma } = setup(type as string, formal as boolean)
    await expect(service.getMaterialParseResultForAgent(caller, input)).resolves.toMatchObject({ pages: [{ text: '客人甲 客人乙' }] })
    expect(prisma.aiCreateTask.findFirst).not.toHaveBeenCalled()
    expect(prisma.agentTask.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: caller.taskId, organizationId: caller.organizationId } }))
  })
  it('rejects an absent/cross-organization task before reading text', async () => {
    const { service, prisma } = setup()
    prisma.agentTask.findFirst.mockResolvedValue(null as never)
    await expect(service.getMaterialParseResultForAgent(caller, input)).rejects.toThrow()
    expect(prisma.conversationSourceParseRun.findFirst).not.toHaveBeenCalled()
  })
  it('rejects another owner before reading text', async () => {
    const { service, prisma, task } = setup()
    task.ownerUserId = 'other'
    await expect(service.getMaterialParseResultForAgent(caller, input)).rejects.toThrow()
    expect(prisma.conversationSourceParseRun.findFirst).not.toHaveBeenCalled()
  })
  it('rejects a stopped attempt before reading text', async () => {
    const { service, prisma } = setup()
    prisma.aiAgentAttempt.findFirst.mockResolvedValue(null as never)
    await expect(service.getMaterialParseResultForAgent(caller, input)).rejects.toThrow()
    expect(prisma.conversationSourceParseRun.findFirst).not.toHaveBeenCalled()
  })
  it('does not read a source outside the batch and conversation', async () => {
    const { service, prisma } = setup()
    prisma.inputBatchSource.findFirst.mockResolvedValue(null as never)
    await expect(service.getMaterialParseResultForAgent(caller, input)).rejects.toThrow('该批次未固定')
    expect(prisma.conversationSourceParseRun.findFirst).not.toHaveBeenCalled()
  })
  it('requires the exact successful parse version', async () => {
    const { service, prisma } = setup()
    prisma.conversationSourceParseRun.findFirst.mockResolvedValue(null as never)
    await expect(service.getMaterialParseResultForAgent(caller, input)).rejects.toThrow('解析结果不存在')
    expect(prisma.conversationSourceParseRun.findFirst).toHaveBeenCalledWith({ where: { sourceId: input.materialId, resultVersion: 1, status: 'succeeded' } })
  })
})

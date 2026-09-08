import { DepartureMaterialService } from './departure-material.service'
describe('conversation source message links', () => {
  it('restores exact message sequences via batches and scopes both queries to this conversation', async () => {
    const source = { id: 'source-1', kind: 'upload', originalFilename: 'photo.png', contentType: 'image/png', status: 'available', statusVersion: 1, sha256: 'hash', sizeBytes: 10, createdAt: new Date(), parseRuns: [], batchSources: [{ inputBatch: { userMessageEvent: { sequence: 3 } } }, { inputBatch: { userMessageEvent: { sequence: 8 } } }] }
    const prisma = { aiConversation: { findFirst: jest.fn().mockResolvedValue({ id: 'chat-1' }) }, conversationSource: { findMany: jest.fn().mockResolvedValue([source]) } }
    const service = new DepartureMaterialService(prisma as never, {} as never, {} as never)
    expect(await service.listConversationSources('org-1', 'user-1', 'chat-1')).toMatchObject([{ id: 'source-1', userMessageSequences: [3, 8] }])
    expect(prisma.aiConversation.findFirst).toHaveBeenCalledWith({ where: { id: 'chat-1', organizationId: 'org-1', creatorUserId: 'user-1' }, select: { id: true } })
    expect(prisma.conversationSource.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org-1', conversationId: 'chat-1' }, include: expect.objectContaining({ batchSources: expect.objectContaining({ where: { organizationId: 'org-1', inputBatch: { conversationId: 'chat-1', organizationId: 'org-1' } } }) }) }))
    prisma.aiConversation.findFirst.mockResolvedValue(null as never)
    prisma.conversationSource.findMany.mockClear()
    await expect(service.listConversationSources('org-1', 'other-user', 'chat-1')).rejects.toThrow('会话不存在')
    expect(prisma.conversationSource.findMany).not.toHaveBeenCalled()
  })
})

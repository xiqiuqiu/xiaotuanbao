import { createProposeDepartureEditReviewTool } from './propose-departure-edit-review.tool'
import { proposeDepartureEditReviewPackage } from './propose-departure-edit-review.client'
import { runWithAssistRequestContext } from './assist-request-context'

jest.mock('./propose-departure-edit-review.client', () => ({
  proposeDepartureEditReviewPackage: jest.fn(),
}))
const submit = jest.mocked(proposeDepartureEditReviewPackage)
const config = { apiBaseUrl: 'http://api.local', serviceSecret: 'secret', modelApiKey: 'test' }
const evidence = [{ kind: 'user_message' as const, sequence: 1, excerpt: '行程改名为新行程' }]
const modelInput = {
  objectVersion: 2,
  confirmationUnit: 'itinerary_segment_update' as const,
  candidates: [
    { fieldKey: 'itinerarySegmentId' as const, proposedValue: 'segment-1', clarity: 'clear' as const, evidence },
    { fieldKey: 'name' as const, proposedValue: '新行程', clarity: 'clear' as const, evidence },
  ],
}
const context = { delegationToken: 'deleg-1', taskId: 'task-1', runId: 'run-1' }

describe('createProposeDepartureEditReviewTool', () => {
  beforeEach(() => submit.mockReset())

  it('uses task-bound identity and preserves revision metadata', async () => {
    const input = { ...modelInput, reviewPackageId: 'review-1', expectedPackageVersion: 2 }
    await runWithAssistRequestContext(context, () =>
      createProposeDepartureEditReviewTool(config).execute?.({ ...input, taskId: 'spoofed', runId: 'spoofed' } as never, {} as never))
    expect(submit).toHaveBeenCalledWith(
      { apiBaseUrl: config.apiBaseUrl, serviceSecret: config.serviceSecret, delegationToken: 'deleg-1' },
      { ...input, taskId: 'task-1', runId: 'run-1' },
    )
  })

  it('accepts incremental guest additions and targeted updates', async () => {
    const input = {
      objectVersion: 2, confirmationUnit: 'source_order_guests_update' as const,
      candidates: [
        { fieldKey: 'sourceOrderId' as const, proposedValue: 'source-1', clarity: 'clear' as const, evidence },
        { fieldKey: 'guestChanges' as const, proposedValue: { add: [{ name: '小王' }], update: [{ guestId: 'guest-1', phone: null }] }, clarity: 'clear' as const, evidence },
      ],
    }
    await runWithAssistRequestContext(context, () =>
      createProposeDepartureEditReviewTool(config).execute?.(input, {} as never))
    expect(submit).toHaveBeenCalledWith(expect.anything(), { ...input, taskId: 'task-1', runId: 'run-1' })
  })

  it.each([
    { ...modelInput, reviewPackageId: 'review-1' },
    { ...modelInput, confirmationUnit: 'source_order_guests_update' },
    { ...modelInput, candidates: [modelInput.candidates[1], modelInput.candidates[1]] },
  ])('rejects invalid target, identity or revision before HTTP', async (input) => {
    await expect(runWithAssistRequestContext(context, () =>
      createProposeDepartureEditReviewTool(config).execute?.(input as never, {} as never),
    )).rejects.toMatchObject({ code: 'INVALID_FORMAT' })
    expect(submit).not.toHaveBeenCalled()
  })

  it('requires configured model availability and task-bound authorization', async () => {
    await expect(createProposeDepartureEditReviewTool({ ...config, modelApiKey: '' }).execute?.(modelInput, {} as never))
      .rejects.toMatchObject({ code: 'AGENT_UNAVAILABLE' })
    await expect(runWithAssistRequestContext({ delegationToken: 'deleg-1' }, () =>
      createProposeDepartureEditReviewTool(config).execute?.(modelInput, {} as never)))
      .rejects.toMatchObject({ code: 'DELEGATION_INVALID' })
    expect(submit).not.toHaveBeenCalled()
  })
})

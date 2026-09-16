import { expect, test } from '@playwright/test'
import {
  candidate,
  createConversation,
  createDeparture,
  loginCoordinator,
  mockDepartureCollaboration,
  openDepartureCollaborationWorkspace,
  reviewPackage,
  type CollaborationFixture,
} from '../support/collaboration'

/**
 * #452 Continue / confirm entry (browser-visible only).
 *
 * Closed / archived “发团已关闭 before already-submitted” ordering is API-level
 * (see apps/api/src/modules/finance/departure-finance-generation.service.spec.ts
 * “ordinary generate prefers closed gate…” and
 * apps/api/test/segment-resource-payables.e2e-spec.ts closed-departure generate).
 * Do not re-assert amount/endDate Conflict or closed gates here.
 */
test.describe('resource payable continue #452', () => {
  test('Continue 仅 confirmed 算已提交；pending 仍可见且应付确认入口可点', async ({ page }) => {
    const stamp = Date.now()
    const title = `e2e452 ${stamp} continue`
    await loginCoordinator(page)
    const departureId = await createDeparture(page, 'e2e452')
    const conversationId = await createConversation(page, title, `e2e452-${stamp}`)

    let payableStatus: 'pending' | 'confirmed' = 'pending'
    const build = (): CollaborationFixture => ({
      conversations: [{ id: conversationId, title }],
      items: [
        reviewPackage({
          id: 'pkg-hotel',
          payloadSchema: 'departure.segment_resource@v1',
          confirmationUnit: 'segment_resource',
          status: 'confirmed',
          candidates: [candidate('title', '4月2日住宿')],
          extras: { conversationId },
        }),
        reviewPackage({
          id: 'pkg-transport',
          payloadSchema: 'departure.segment_resource@v1',
          confirmationUnit: 'segment_resource',
          status: 'confirmed',
          candidates: [candidate('title', '关西交通')],
          extras: { conversationId },
        }),
        reviewPackage({
          id: 'pkg-pay-hotel',
          payloadSchema: 'resource.payable@v1',
          confirmationUnit: 'resource_payable',
          status: payableStatus,
          candidates: [
            candidate('sourceType', 'segment_resource'),
            candidate('sourceId', 'res-hotel'),
            candidate('title', '4月2日住宿'),
            candidate('resourceKind', 'hotel'),
            candidate('supplierName', '关西酒店'),
            candidate('amountCents', 880_000),
            candidate('historyStatus', 'ready'),
            candidate(
              'historyMessage',
              '以下为约定应付，确认后按该项提交；不是付款或流水。',
            ),
          ],
          extras: {
            conversationId,
            capabilityKey: 'departure.resource-payable.prepare',
            baselineSnapshot: { sourceType: 'segment_resource', sourceId: 'res-hotel' },
          },
        }),
      ],
      confirmations: [
        {
          decisionCommandId: 'decision-resources',
          accepted: true,
          items: [
            {
              packageId: 'pkg-hotel',
              status: 'succeeded',
              resultRef: { objectKind: 'segment_resource', objectId: 'res-hotel' },
            },
            {
              packageId: 'pkg-transport',
              status: 'succeeded',
              resultRef: { objectKind: 'segment_resource', objectId: 'res-transport' },
            },
          ],
        },
      ],
    })

    await mockDepartureCollaboration(page, departureId, build)
    const workspace = await openDepartureCollaborationWorkspace(page, departureId, title, stamp)

    await workspace.getByRole('tab', { name: '关西交通 已确认' }).click()
    const transportPanel = workspace.getByRole('tabpanel', { name: '关西交通 已确认' })
    await expect(transportPanel.getByText('资源已写入')).toBeVisible()
    await expect(transportPanel.getByRole('button', { name: '继续提交应付' })).toBeVisible()
    // pending payable does not remove hotel from Continue
    await expect(transportPanel.getByRole('checkbox', { name: '4月2日住宿' })).toBeVisible()
    await expect(transportPanel.getByRole('checkbox', { name: '关西交通' })).toBeVisible()

    await workspace.getByRole('tab', { name: '4月2日住宿 待审核' }).click()
    const payablePanel = workspace
      .getByRole('tabpanel', { name: '4月2日住宿 待审核' })
      .getByLabel('初始应付审核')
    await expect(payablePanel).toBeVisible()
    await expect(payablePanel.getByRole('button', { name: '确认提交约定应付' })).toBeVisible()
    await expect(payablePanel.getByText('关西酒店')).toBeVisible()
    await expect(payablePanel.getByText('¥8,800.00')).toBeVisible()

    // confirmed payable removes hotel from Continue; wait for collaboration refetchInterval
    payableStatus = 'confirmed'
    await workspace.getByRole('tab', { name: '关西交通 已确认' }).click()
    const afterPanel = workspace.getByRole('tabpanel', { name: '关西交通 已确认' })
    await expect(afterPanel.getByRole('checkbox', { name: '4月2日住宿' })).toHaveCount(0, {
      timeout: 10_000,
    })
    await expect(afterPanel.getByRole('checkbox', { name: '关西交通' })).toBeVisible()
  })
})

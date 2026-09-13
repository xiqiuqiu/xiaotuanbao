import { expect, test } from '@playwright/test'
import {
  candidate,
  createConversation,
  createDeparture,
  loginCoordinator,
  mockDepartureCollaboration,
  openDepartureCollaborationWorkspace,
  reviewPackage,
} from '../support/collaboration'

/**
 * #456 business acceptance samples — browser-visible sample-card fields only.
 *
 * Prefer AGENT_HEADLESS_ADAPTER=deterministic (or deterministic route fixtures below)
 * over live Gemini. Amount conservation / hard finance gates stay in
 * packages/ai-contracts eval + API Jest e2e — not re-asserted here.
 *
 * Materials aligned with packages/ai-contracts/src/eval/business-acceptance-fixtures.ts.
 */
test.describe('business acceptance samples #456', () => {
  test('样例卡片展示明确总价字段；空证据与 OCR 冲突走红路径可见态', async ({ page }) => {
    test.info().annotations.push({
      type: 'note',
      description:
        'Uses deterministic collaboration fixtures (AGENT_HEADLESS_ADAPTER=deterministic equivalent). Live Gemini not required.',
    })

    const stamp = Date.now()
    const title = `e2e456 ${stamp} samples`
    await loginCoordinator(page)
    const departureId = await createDeparture(page, 'e2e456')
    const conversationId = await createConversation(page, title, `e2e456-${stamp}`)

    await mockDepartureCollaboration(page, departureId, {
      conversations: [{ id: conversationId, title }],
      items: [
        reviewPackage({
          id: 'pkg-explicit-total',
          payloadSchema: 'departure.segment_resource@v1',
          confirmationUnit: 'segment_resource',
          status: 'pending',
          candidates: [
            candidate('title', '4月2日住宿', {
              evidence: [
                {
                  kind: 'user_message',
                  sequence: 1,
                  excerpt: '挂云上酒店，最终约定总价 8800 元含早，不再按间夜拆',
                },
              ],
            }),
            candidate('resourceKind', 'hotel', {
              evidence: [{ kind: 'user_message', sequence: 1, excerpt: '4月2日住宿' }],
            }),
            candidate('amountCents', 880_000, {
              evidence: [{ kind: 'user_message', sequence: 1, excerpt: '8800 元' }],
            }),
            candidate('supplierId', null, {
              clarity: 'needs_confirmation',
              evidence: [{ kind: 'user_message', sequence: 1, excerpt: '云上酒店' }],
            }),
            candidate('notes', '不再按间夜拆', {
              evidence: [{ kind: 'user_message', sequence: 1, excerpt: '不再按间夜拆' }],
            }),
          ],
          extras: { conversationId },
        }),
        reviewPackage({
          id: 'pkg-ocr-conflict',
          payloadSchema: 'departure.segment_resource@v1',
          confirmationUnit: 'segment_resource',
          status: 'conflict',
          candidates: [
            candidate('title', 'OCR冲突住宿', {
              clarity: 'needs_confirmation',
              evidence: [
                { kind: 'user_message', sequence: 1, excerpt: '酒店最终按 8800 元结' },
                { kind: 'user_message', sequence: 2, excerpt: '云上酒店 9800 元' },
              ],
            }),
            candidate('amountCents', null, {
              clarity: 'needs_confirmation',
              evidence: [
                { kind: 'user_message', sequence: 1, excerpt: '约定 8800 元' },
                { kind: 'user_message', sequence: 2, excerpt: 'OCR 9800 元' },
              ],
            }),
            candidate('resourceKind', 'hotel'),
          ],
          extras: {
            conversationId,
            confirmationBlockedReason: 'OCR 金额与文字约定冲突，需人工确认后才能写入',
          },
        }),
        reviewPackage({
          id: 'pkg-empty-evidence',
          payloadSchema: 'departure.segment_resource@v1',
          confirmationUnit: 'segment_resource',
          status: 'pending',
          candidates: [
            candidate('title', '空证据样例', {
              clarity: 'undetermined',
              evidence: [],
            }),
            candidate('amountCents', 560_000, {
              clarity: 'needs_confirmation',
              evidence: [],
            }),
            candidate('resourceKind', 'hotel', { evidence: [] }),
          ],
          extras: { conversationId },
        }),
      ],
      confirmations: [],
    })

    const workspace = await openDepartureCollaborationWorkspace(page, departureId, title, stamp)

    await workspace.getByRole('tab', { name: '4月2日住宿 待审核' }).click()
    const explicitPanel = workspace.getByRole('tabpanel', { name: '4月2日住宿 待审核' })
    await expect(explicitPanel.getByLabel('资源名称候选')).toHaveValue('4月2日住宿')
    await expect(explicitPanel.getByLabel('约定总价候选')).toHaveValue('8800.00')
    await expect(explicitPanel.getByLabel('备注候选')).toHaveValue('不再按间夜拆')
    await explicitPanel.getByText('查看证据').click()
    await expect(explicitPanel.getByText('8800 元', { exact: true })).toBeVisible()
    await expect(
      explicitPanel.getByText('挂云上酒店，最终约定总价 8800 元含早，不再按间夜拆', { exact: true }),
    ).toBeVisible()

    await workspace.getByRole('tab', { name: 'OCR冲突住宿 需重新核对' }).click()
    await expect(workspace.getByRole('tab', { name: 'OCR冲突住宿 需重新核对' })).toBeVisible()
    const ocrPanel = workspace.getByRole('tabpanel', { name: 'OCR冲突住宿 需重新核对' })
    await expect(ocrPanel.getByText(/OCR 金额与文字约定冲突/)).toBeVisible()
    await ocrPanel.getByText('查看证据').click()
    await expect(
      ocrPanel.getByText('酒店最终按 8800 元结；云上酒店 9800 元', { exact: true }),
    ).toBeVisible()
    await expect(ocrPanel.getByText('约定 8800 元；OCR 9800 元', { exact: true })).toBeVisible()

    await workspace.getByRole('tab', { name: '空证据样例 待审核' }).click()
    const emptyPanel = workspace.getByRole('tabpanel', { name: '空证据样例 待审核' })
    await expect(emptyPanel.getByLabel('资源名称候选')).toHaveValue('空证据样例')
    await emptyPanel.getByText('查看证据').click()
    await expect(emptyPanel.getByText('整单优惠 2000 元')).toHaveCount(0)
    await expect(emptyPanel.getByText('挂云上酒店，最终约定总价 8800 元含早')).toHaveCount(0)
  })
})

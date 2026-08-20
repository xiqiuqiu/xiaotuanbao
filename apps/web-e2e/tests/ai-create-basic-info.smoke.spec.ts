import { test, expect } from '@playwright/test'
import { coordinatorUser } from '../support/credentials'
import { loginAs } from '../support/auth'
import { paths } from '../support/urls'

function deterministicReviewName(): string | null {
  if (process.env.AI_CREATE_ASSIST_ENABLED !== 'true') {
    return null
  }
  if (process.env.AGENT_HEADLESS_ADAPTER !== 'deterministic') {
    return null
  }
  const raw = process.env.AGENT_HEADLESS_OUTCOME?.trim()
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as {
      kind?: string
      reviewPackage?: { candidates?: Array<{ fieldKey?: string; proposedValue?: unknown }> }
    }
    if (parsed.kind !== 'awaiting_review') {
      return null
    }
    const name = parsed.reviewPackage?.candidates?.find((item) => item.fieldKey === 'name')
      ?.proposedValue
    return typeof name === 'string' && name.length > 0 ? name : null
  } catch {
    return null
  }
}

const proposedName = deterministicReviewName()

test.describe('AI create basic_info smoke', () => {
  test('纯文字发送后确认写入草稿，刷新仍在', async ({ page }) => {
    if (!proposedName) {
      test.skip(
        true,
        '需要本地 AI_CREATE_ASSIST_ENABLED=true 且 AGENT_HEADLESS_ADAPTER=deterministic 的 awaiting_review 结果',
      )
      return
    }
    const expectedName = proposedName
    const stamp = Date.now()
    await loginAs(page, coordinatorUser)
    await page.goto(paths.departureNew)
    await expect(page.getByRole('heading', { name: '新建发团' })).toBeVisible()

    await page.getByRole('button', { name: /AI 辅助/ }).click()
    await expect(page.getByLabel('询问当前发团草稿')).toBeVisible()

    await page.getByLabel('询问当前发团草稿').fill(`e2e-ai-smoke ${stamp} 请按这个团名建团`)
    await page.getByRole('button', { name: '发送' }).click()

    await expect(page.getByText('等待表单审核')).toBeVisible({ timeout: 45_000 })
    await expect(page.getByRole('button', { name: '确认写入草稿' })).toBeVisible()
    await page.getByRole('button', { name: '确认写入草稿' }).click()

    await expect(page.getByLabel('团名')).toHaveValue(expectedName, { timeout: 15_000 })

    await page.reload()
    await expect(page.getByLabel('团名')).toHaveValue(expectedName)
    await expect(page.getByText('等待表单审核')).not.toBeVisible()
  })
})

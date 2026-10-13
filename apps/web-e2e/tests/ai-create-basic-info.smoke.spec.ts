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
  test('双击确认只写入一次，刷新仍在', async ({ page }) => {
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
    const sessionResponse = await page.request.post(
      '/api/agent/tasks/departure-creation/sessions',
      {
        data: { draft: { mode: 'manual', routeName: '' } },
        headers: { origin: new URL(page.url()).origin },
      },
    )
    const sessionText = await sessionResponse.text()
    expect(
      sessionResponse.ok(),
      `start session failed: ${sessionResponse.status()} ${sessionText}`,
    ).toBe(true)
    const sessionBody = JSON.parse(sessionText) as {
      data?: {
        task?: {
          id?: string
          draft?: { version?: number; snapshot?: Record<string, unknown> }
          [key: string]: unknown
        }
        conversation?: { id?: string }
      }
    }
    const sessionTask = sessionBody.data?.task
    const taskId = sessionTask?.id
    const conversationId = sessionBody.data?.conversation?.id
    expect(taskId).toBeTruthy()
    expect(conversationId).toBeTruthy()
    expect(sessionTask?.draft?.version).toBeTruthy()

    const reviewPackage = {
      id: `review-${stamp}`,
      status: 'pending',
      confirmationUnit: 'basic_info_draft',
      payloadSchema: 'departure.basic_info_draft@v1',
      schemaSupported: true,
      baseObjectVersion: sessionTask!.draft!.version,
      version: 1,
      runId: `run-${stamp}`,
      conversationId,
      inputBatchId: `batch-${stamp}`,
      attemptId: `attempt-${stamp}`,
      capabilityKey: 'departure.review-package.propose',
      capabilityVersion: 1,
      targetKind: 'departure_creation_draft',
      targetId: `draft-${stamp}`,
      proposalHash: 'a'.repeat(64),
      candidates: [
        {
          fieldKey: 'name',
          proposedValue: expectedName,
          clarity: 'clear',
          status: 'pending',
          evidence: [{ kind: 'user_message', sequence: 1, excerpt: expectedName }],
        },
      ],
      baselineSnapshot: sessionTask!.draft!.snapshot,
    }
    let taskResponse = {
      ...sessionTask,
      pendingReview: reviewPackage,
      pendingReviews: [reviewPackage],
      reviewConflicts: [],
    }
    await page.route(`**/api/agent/tasks/${taskId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'success', data: taskResponse }),
      })
    })
    await page.route('**/api/ai-create-tasks/draft', async (route) => {
      const input = route.request().postDataJSON() as {
        expectedVersion?: number
        draft?: Record<string, unknown>
      }
      const currentDraft = taskResponse.draft as {
        version?: number
        snapshot?: Record<string, unknown>
      }
      taskResponse = {
        ...taskResponse,
        draft: {
          ...currentDraft,
          version: (input.expectedVersion ?? currentDraft.version ?? 0) + 1,
          snapshot: input.draft ?? currentDraft.snapshot,
        },
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 0, message: 'success', data: taskResponse }),
      })
    })
    let confirmRequestCount = 0
    await page.route(
      `**/api/agent/review-packages/${reviewPackage.id}/confirm`,
      async (route) => {
        confirmRequestCount += 1
        const input = route.request().postDataJSON() as { expectedVersion?: number }
        const currentDraft = taskResponse.draft as {
          version?: number
          snapshot?: Record<string, unknown>
        }
        taskResponse = {
          ...taskResponse,
          draft: {
            ...currentDraft,
            version: (input.expectedVersion ?? currentDraft.version ?? 0) + 1,
            snapshot: { ...currentDraft.snapshot, name: expectedName },
          },
          pendingReview: null,
          pendingReviews: [],
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ code: 0, message: 'success', data: taskResponse }),
        })
      },
    )

    await page.goto(`${paths.departureNew}?taskId=${encodeURIComponent(taskId!)}`)
    await expect(page.getByRole('heading', { name: '新建发团' })).toBeVisible()

    await expect(page.getByRole('region', { name: 'AI 阶段审核包' })).toBeVisible({
      timeout: 45_000,
    })
    const confirmButton = page.getByRole('button', { name: '确认写入草稿' })
    await expect(confirmButton).toBeVisible()
    await confirmButton.dblclick()

    const nameField = page.getByRole('textbox', { name: '* 团名', exact: true })
    await expect(nameField).toHaveValue(expectedName, { timeout: 15_000 })
    expect(confirmRequestCount).toBe(1)

    await page.reload()
    await expect(page.getByRole('textbox', { name: '* 团名', exact: true })).toHaveValue(
      expectedName,
    )
    await expect(page.getByRole('region', { name: 'AI 阶段审核包' })).not.toBeVisible()
  })
})

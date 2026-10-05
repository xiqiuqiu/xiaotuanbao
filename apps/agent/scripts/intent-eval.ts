/** Real provider + production Agent factory/instructions/tool loop; business API is local fixture only. */
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import {
  AI_CREATE_AGENT_DEFINITION_REF, AI_CREATE_CAPABILITY_REFS_BY_TOOL,
  CONVERSATION_ROUTING_CAPABILITY_REF, CONVERSATION_HISTORY_READ_PREFACE,
  CONVERSATION_GENERAL_AGENT_DEFINITION_REF, DEPARTURE_COLLABORATION_AGENT_DEFINITION_REF,
  requestContextSchema, submitReviewPackageInputSchema, proposeReviewPackageOutputSchema,
} from '@xiaotuanbao/ai-contracts'
import { createAiCreateMastraFromDefinition, AI_CREATE_AGENT_ID, toolNamesForRequestContext } from '../src/agent-factory'
import { runWithAssistRequestContext } from '../src/assist-request-context'
import { createMastraHeadlessExecutor } from '../src/mastra-headless.executor'
import { collectHeadlessRun } from '../src/headless-execution'
import { loadAgentConfigFromEnv } from '../src/server'
import { intentCases, extendedIntentCases, scoreIntent } from './intent-fixtures/cases'

const sha = (text: string) => createHash('sha256').update(text).digest('hex')

async function main() {
  for (const file of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
    try { loadEnvFile(file); break } catch { /* exported environment is also supported */ }
  }
  const config = loadAgentConfigFromEnv()
  if (!config.modelApiKey) throw new Error('DEEPSEEK_API_KEY is missing; real-provider eval cannot run')
  const repeats = Number(process.env.INTENT_EVAL_REPEATS ?? 3)
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 10) throw new Error('INTENT_EVAL_REPEATS must be 1..10')
  const matrix = process.env.INTENT_EVAL_MATRIX === 'extended' ? extendedIntentCases : [...intentCases, ...extendedIntentCases]
  const selected = matrix.filter((item) => !process.env.INTENT_EVAL_CASE || item.id === process.env.INTENT_EVAL_CASE)
  if (!selected.length) throw new Error('INTENT_EVAL_CASE did not match a fixture')
  const rows = []
  for (const fixture of selected) {
    for (let repeat = 1; repeat <= repeats; repeat++) {
      const started = Date.now()
      const calls: string[] = []
      const toolTrace: unknown[] = []
      const context = requestContextSchema.parse({
        organizationId: 'eval-org', userId: 'eval-user',
        ...(fixture.definition !== 'general' ? { taskId: 'eval-task', runId: 'eval-attempt' } : {}),
        conversationId: 'eval-conversation', inputBatchId: 'eval-batch', attemptId: 'eval-attempt',
        contextManifestId: 'eval-manifest', executionGoal: 'resolve_items',
        agentDefinition: fixture.definition === 'general' ? CONVERSATION_GENERAL_AGENT_DEFINITION_REF
          : fixture.definition === 'collaboration' ? DEPARTURE_COLLABORATION_AGENT_DEFINITION_REF : AI_CREATE_AGENT_DEFINITION_REF,
        grantedCapabilities: [
          ...(fixture.definition !== 'general' ? [AI_CREATE_CAPABILITY_REFS_BY_TOOL.getTaskContext] : []),
          ...(!fixture.definition ? [AI_CREATE_CAPABILITY_REFS_BY_TOOL.submitReviewPackage] : []),
          AI_CREATE_CAPABILITY_REFS_BY_TOOL.readConversationHistory, CONVERSATION_ROUTING_CAPABILITY_REF],
        entitlementStatus: 'unavailable',
        objectScopes: [{ organizationId: 'eval-org', kind: 'agent_conversation', id: 'eval-conversation' },
          ...(fixture.definition !== 'general' ? [{ organizationId: 'eval-org', kind: 'ai_create_task', id: 'eval-task' }] : [])],
      })
      const history = fixture.history ?? ''
      const pendingItems = fixture.pendingItems ?? []
      const userText = `【未决交互】\n${JSON.stringify({ hasPendingReview: false, reviewPackageId: null, pendingItems })}\n\n【近期对话】\n${history || '无'}\n\n当前用户消息（sequence=3）：${fixture.text}`
      const server = createServer((request, response) => {
        void (async () => {
          const path = new URL(request.url ?? '/', 'http://localhost').pathname
          calls.push(path)
          let data: unknown
          if (path === '/api/ai-tools/v1/get-task-context') {
            data = {
              task: { id: 'eval-task', status: 'in_progress', currentPhase: 'basic_info', creatorUserId: 'eval-user' },
              snapshot: { mode: 'manual', routeName: '川西五日线', name: '九月出游', startDate: '2026-09-25',
                endDate: '2026-09-29', ownerUserId: 'eval-user', departureType: 'combined',
                ...(fixture.definition === 'collaboration' ? { departureId: 'eval-departure', guestCount: 10, adultGuestCount: 8, childGuestCount: 2, sourceOrders: [] } : {}) },
              objectVersion: 1, pending: { hasPendingReview: false, reviewPackageId: null },
              availableCapabilities: toolNamesForRequestContext(context).filter(name => name !== 'recordWorkItems'),
              fieldCoverage: { filled: ['name', 'routeName', 'startDate', 'endDate', 'ownerUserId', 'departureType'], missing: [], optionalPresent: [] },
            }
          } else if (path === '/api/ai-tools/v1/read-conversation-history') {
            data = { conversationId: 'eval-conversation', conversationVersion: 3, truncated: false,
              preface: CONVERSATION_HISTORY_READ_PREFACE,
              events: [history, fixture.text].filter(Boolean).map((text, index) => ({
                sequence: index ? 3 : 1, kind: 'user_message', text,
                locator: { kind: 'conversation_event', conversationId: 'eval-conversation',
                  sequence: index ? 3 : 1, eventKind: 'user_message', contentDigest: sha(text), charRange: { start: 0, end: text.length } },
              })) }
          } else if (path === '/api/ai-tools/v1/propose-review-package') {
            const chunks: Buffer[] = []
            for await (const chunk of request) chunks.push(Buffer.from(chunk))
            const proposal = submitReviewPackageInputSchema.parse(JSON.parse(Buffer.concat(chunks).toString()))
            // This fixture checks tool wire shape only, not production authorization or evidence authenticity.
            data = proposeReviewPackageOutputSchema.parse({
              status: 'accepted', objectVersion: proposal.objectVersion, confirmationUnit: proposal.confirmationUnit,
              candidates: proposal.candidates,
              normalizedProposal: { schemaVersion: 1, normalizationVersion: 'unicode-nfc-whitespace-v1',
                policyVersion: 'evidence-authenticity-v1',
                candidates: proposal.candidates.map((candidate, index) => ({ candidateIndex: index,
                  candidateId: candidate.fieldKey, proposedValue: candidate.proposedValue, evidenceIds: ['eval-evidence'] })),
                evidenceCatalog: [{ schemaVersion: 1, evidenceId: 'eval-evidence', attemptId: 'eval-attempt',
                  contextManifestId: 'eval-manifest', kind: 'user_message',
                  locator: { conversationId: 'eval-conversation', eventId: 'eval-message', sequence: 3,
                    normalizedTextRange: { start: 0, end: fixture.text.length } },
                  excerpt: { text: fixture.text, sha256: sha(fixture.text) }, sourceSha256: sha(fixture.text) }],
              },
            })
          } else {
            response.writeHead(404); response.end(JSON.stringify({ message: 'No fixture for this tool' })); return
          }
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify({ code: 0, data }))
        })().catch(() => { response.writeHead(400); response.end(JSON.stringify({ message: 'Fixture schema rejected input' })) })
      })
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Fixture listener unavailable')
      try {
        const mastra = createAiCreateMastraFromDefinition({ ...config,
          apiBaseUrl: `http://127.0.0.1:${address.port}`, serviceSecret: 'eval-only',
        }, context)
        const executor = createMastraHeadlessExecutor({ readUserText: async () => userText,
          stream: (text, signal) => mastra.getAgent(AI_CREATE_AGENT_ID).stream(text, {
            abortSignal: signal, maxSteps: 12,
            onStepFinish: (step) => { toolTrace.push({ toolCalls: step.toolCalls, toolResults: step.toolResults }) },
          }),
        })
        const { result } = await runWithAssistRequestContext({ ...context, delegationToken: 'eval-only' },
          () => collectHeadlessRun(executor({ ...context, userText, pendingItems, currentUserText: fixture.text, userTextSha256: sha(userText) },
            { signal: AbortSignal.timeout(180_000) })))
        const items = 'items' in result && Array.isArray(result.items) ? result.items : []
        const score = scoreIntent(fixture.expected, items)
        if (fixture.expectedName) {
          score.passed &&= result.kind === 'resolved_items' && result.reviewPackages.some((pkg) =>
            pkg.candidates.some((candidate) => candidate.fieldKey === 'name' && candidate.proposedValue === fixture.expectedName))
        }
        score.passed &&= pendingItems.every(pending => items.some(item =>
          item.id === pending.id && item.request === pending.request && item.goal === pending.goal))
        rows.push({ id: fixture.id, definition: context.agentDefinition, input: fixture.text, expected: fixture.expected,
          repeat, ...score, latencyMs: Date.now() - started, calls, toolTrace, result })
        process.stdout.write(`${fixture.id} #${repeat}: ${score.passed ? 'PASS' : 'FAIL'} ${score.actual.join(',')}\n`)
      } catch (error) {
        // Never write provider exceptions/headers: they can contain credentials.
        rows.push({ id: fixture.id, repeat, passed: false, extraClarifications: 0,
          error: error instanceof Error ? error.name : 'UnknownError', latencyMs: Date.now() - started, calls })
        process.stdout.write(`${fixture.id} #${repeat}: ERROR\n`)
      } finally {
        server.closeAllConnections()
        await new Promise<void>((resolve) => server.close(() => resolve()))
      }
    }
  }
  const report = { realProvider: true, model: config.model, thinking: config.modelThinking, thinkingEffort: config.modelThinkingEffort, repeats,
    scope: 'Production Agent factory and tool loop; synthetic draft/business tools; no production business writes or authorization evaluation',
    total: rows.length, failed: rows.filter((row) => !row.passed).length,
    extraClarifications: rows.reduce((sum, row) => sum + row.extraClarifications, 0), rows }
  const output = resolve(process.env.INTENT_EVAL_OUTPUT ?? '/tmp/xiaotuanbao-intent-eval.json')
  await mkdir(resolve(output, '..'), { recursive: true })
  await writeFile(output, JSON.stringify(report, null, 2).replaceAll(config.modelApiKey, '<REDACTED>'))
  process.stdout.write(`Report: ${output}; ${report.failed}/${report.total} failed, ${report.extraClarifications} extra clarifications\n`)
  if (report.failed) process.exitCode = 1
}

main().catch((error: unknown) => {
  process.stderr.write(error instanceof Error && error.message.startsWith('DEEPSEEK_API_KEY')
    ? `${error.message}\n` : `Eval setup failed: ${error instanceof Error ? error.name : 'UnknownError'}\n`)
  process.exitCode = 1
})

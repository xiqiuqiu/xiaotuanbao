import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { headlessExecutionResultSchema } from '@xiaotuanbao/ai-contracts'
import { departureObjectVersion } from '../src/modules/ai-create-task/departure-object-version'
import { dropE2eDatabase, prepareE2eDatabase, runSetupCommand, spawnTestCommand } from './support/e2e-database-isolation'
import { resolvedItemOutcome, startDeterministicHeadlessAgent } from './support/deterministic-headless-agent'

const apiRoot = resolve(__dirname, '..')
const root = resolve(apiRoot, '../..')
const answer = resolvedItemOutcome({ kind: 'answered', message: 'P0 确定性查询已完成', completionBasis: { kind: 'final_answer' } })

async function freePort() {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  await new Promise<void>(resolve => server.close(() => resolve()))
  return port
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>(resolve => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
    child.once('exit', () => { clearTimeout(timer); resolve() })
    child.kill('SIGTERM')
  })
}
async function ready(url: string, child: ChildProcess) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error('P0 service exited before readiness')
    if (await fetch(url).then(r => r.ok).catch(() => false)) return
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`P0 service did not become ready: ${url}`)
}

async function main() {
  const baseUrl = process.env.DATABASE_URL
  if (!baseUrl) throw new Error('DATABASE_URL is required for isolated browser P0')
  const prepared = await prepareE2eDatabase(baseUrl)
  console.log(`[web-p0] prepared ${prepared.schema}`)
  const apiPort = await freePort()
  const webPort = await freePort()
  const apiUrl = `http://127.0.0.1:${apiPort}`
  const webUrl = `http://localhost:${webPort}`
  const serviceSecret = randomUUID()
  const controlKey = randomUUID()
  const children: ChildProcess[] = []
  const env = { ...process.env, DATABASE_URL: prepared.databaseUrl, API_PORT: String(apiPort),
    WEB_ORIGINS: `${webUrl},http://localhost:5173`, AI_CREATE_ASSIST_ENABLED: 'true',
    AGENT_SERVICE_SECRET: serviceSecret, AI_MODEL: 'deterministic', NODE_ENV: 'test',
    WORKFLOW_LEASE_MS: '5000', WORKFLOW_HEARTBEAT_MS: '1000' }
  const prisma = new PrismaClient({ datasourceUrl: prepared.databaseUrl })
  const agent = await startDeterministicHeadlessAgent({ getApiBaseUrl: () => apiUrl, serviceSecret, outcome: answer })
  const launch = (file: string) => {
    const child = spawn(process.execPath, [resolve(apiRoot, 'dist', file)], {
      cwd: apiRoot, env: { ...env, AGENT_INTERNAL_URL: agent.origin }, stdio: 'inherit',
    })
    children.push(child)
    return child
  }
  let api: ChildProcess
  let worker: ChildProcess
  const control = createServer(async (req, res) => {
    const json = (value: unknown, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value))
    }
    if (req.url === '/copilotkit/info') return json({ version: '1.67.1', mode: 'sse', agents: {
      'ai-create-readonly-assist': { name: 'ai-create-readonly-assist', description: '' },
    } })
    if (req.method !== 'POST' || req.headers['x-p0-control-key'] !== controlKey) return json({}, 403)
    try {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      const body = JSON.parse(Buffer.concat(chunks).toString())
      if (req.url === '/reset') { agent.release(); agent.setOutcome(answer) }
      else if (req.url === '/outcome') agent.setOutcomes(body.outcomes.map((value: unknown) => headlessExecutionResultSchema.parse(value)))
      else if (req.url === '/hold') agent.holdNextCall()
      else if (req.url === '/release') agent.release()
      else if (req.url === '/review') {
        const departure = await prisma.departure.findUniqueOrThrow({ where: { id: body.departureId } })
        const version = await departureObjectVersion(prisma, departure.organizationId, departure.id)
        agent.setOutcome(resolvedItemOutcome({ kind: 'awaiting_review', completionBasis: { kind: 'accepted_review_package' }, reviewPackage: {
          objectVersion: version, confirmationUnit: 'itinerary_segment_update', candidates: [
            ['itinerarySegmentId', body.segmentId], ['name', body.name],
          ].map(([fieldKey, proposedValue]) => ({ fieldKey, proposedValue, clarity: 'clear' as const,
            evidence: [{ kind: 'user_message' as const, sequence: 1, excerpt: body.text }] })),
        } }))
      } else if (req.url === '/restart-api') { await stop(api); api = launch('main.js'); await ready(`${apiUrl}/api/health`, api) }
      else if (req.url === '/restart-worker') { await stop(worker); worker = launch('workflow-worker.main.js') }
      else return json({}, 404)
      json({ ok: true })
    } catch (error) { json({ message: error instanceof Error ? error.message : String(error) }, 500) }
  })
  let testChild: ChildProcess | undefined
  const interrupt = () => { testChild?.kill('SIGTERM') }
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt)
  try {
    runSetupCommand('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { cwd: apiRoot, env })
    runSetupCommand('pnpm', ['exec', 'tsx', 'prisma/seed.ts'], { cwd: apiRoot, env })
    api = launch('main.js'); await ready(`${apiUrl}/api/health`, api)
    worker = launch('workflow-worker.main.js')
    await new Promise<void>(resolve => control.listen(0, '127.0.0.1', resolve))
    const controlUrl = `http://127.0.0.1:${(control.address() as AddressInfo).port}`
    const browserEnv = { ...env, WEB_E2E_BASE_URL: webUrl, WEB_E2E_API_URL: apiUrl,
      WEB_E2E_CONTROL_URL: controlUrl, WEB_E2E_CONTROL_KEY: controlKey }
    const web = spawn(process.execPath, [resolve(root, 'apps/web/node_modules/vite/bin/vite.js'), '--config', '../web-e2e/vite.p0.config.ts',
      '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], { cwd: resolve(root, 'apps/web'), env: browserEnv, stdio: 'inherit' })
    children.push(web); await ready(`${webUrl}/login`, web)
    const running = spawnTestCommand(process.execPath, [resolve(root, 'apps/web-e2e/node_modules/@playwright/test/cli.js'), 'test',
      'tests/agent-p0.spec.ts', '--retries=0', '--trace=retain-on-failure', `--output=${resolve(root, 'apps/web-e2e/test-results', `p0-${prepared.runId}`)}`, ...process.argv.slice(2).filter((arg, index) => arg !== '--' || index > 0)], { cwd: resolve(root, 'apps/web-e2e'), env: browserEnv })
    testChild = running.child
    const result = await running.completed
    process.exitCode = result.code
  } finally {
    process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt)
    agent.release()
    await Promise.all(children.map(stop))
    control.closeAllConnections(); await new Promise<void>(resolve => control.close(() => resolve()))
    await agent.close(); await prisma.$disconnect()
    await dropE2eDatabase(baseUrl, prepared.schema, prepared.runId)
    console.log('[web-p0] isolated schema removed')
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })

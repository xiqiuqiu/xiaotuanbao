import { resolve } from 'node:path'
import {
  dropE2eDatabase,
  prepareE2eDatabase,
  runSetupCommand,
  spawnTestCommand,
} from './support/e2e-database-isolation'

const SIGNAL_EXIT_CODES: Partial<Record<NodeJS.Signals, number>> = {
  SIGINT: 130,
  SIGTERM: 143,
}

async function main(): Promise<number> {
  const baseDatabaseUrl = process.env.DATABASE_URL
  if (!baseDatabaseUrl) {
    throw new Error('API E2E requires DATABASE_URL before isolation can be provisioned')
  }

  const apiRoot = resolve(__dirname, '..')
  runSetupCommand('pnpm', ['--filter', '@xiaotuanbao/shared', 'build'], {
    cwd: apiRoot,
    env: process.env,
  })
  runSetupCommand('pnpm', ['--filter', '@xiaotuanbao/ai-contracts', 'build'], {
    cwd: apiRoot,
    env: process.env,
  })
  runSetupCommand('pnpm', ['exec', 'prisma', 'generate'], {
    cwd: apiRoot,
    env: process.env,
  })

  const prepared = await prepareE2eDatabase(baseDatabaseUrl)
  const env = {
    ...process.env,
    DATABASE_URL: prepared.databaseUrl,
    XIAOTUANBAO_E2E_RUN_ID: prepared.runId,
    XIAOTUANBAO_E2E_SCHEMA: prepared.schema,
  }
  let child: ReturnType<typeof spawnTestCommand>['child'] | undefined
  let receivedSignal: NodeJS.Signals | undefined
  const forwardSignal = (signal: NodeJS.Signals) => {
    receivedSignal = signal
    child?.kill(signal)
  }
  const onSigint = () => forwardSignal('SIGINT')
  const onSigterm = () => forwardSignal('SIGTERM')
  process.on('SIGINT', onSigint)
  process.on('SIGTERM', onSigterm)
  const interruptedExitCode = () =>
    receivedSignal ? (SIGNAL_EXIT_CODES[receivedSignal] ?? 1) : undefined

  console.log(`[e2e-db] prepared isolated schema ${prepared.schema}`)
  try {
    runSetupCommand('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: apiRoot,
      env,
    })
    if (interruptedExitCode()) {
      return interruptedExitCode()!
    }
    runSetupCommand('pnpm', ['exec', 'tsx', 'prisma/seed.ts'], {
      cwd: apiRoot,
      env,
    })
    if (interruptedExitCode()) {
      return interruptedExitCode()!
    }

    const forwardedArgs = process.argv.slice(2).filter((arg, index) => arg !== '--' || index > 0)
    const running = spawnTestCommand(
      'pnpm',
      ['exec', 'jest', '--config', 'jest-e2e.config.js', '--runInBand', ...forwardedArgs],
      { cwd: apiRoot, env },
    )
    child = running.child
    const result = await running.completed
    if (receivedSignal) {
      return SIGNAL_EXIT_CODES[receivedSignal] ?? 1
    }
    if (result.signal) {
      return SIGNAL_EXIT_CODES[result.signal] ?? 1
    }
    return result.code
  } finally {
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
    await dropE2eDatabase(baseDatabaseUrl, prepared.schema, prepared.runId)
    console.log(`[e2e-db] dropped isolated schema ${prepared.schema}`)
  }
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })

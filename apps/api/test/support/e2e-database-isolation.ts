import { randomBytes } from 'node:crypto'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { Client } from 'pg'

export const E2E_SCHEMA_PREFIX = 'e2e_jest_'
const E2E_SCHEMA_PATTERN = /^e2e_jest_[a-z0-9_]+$/
const E2E_SCHEMA_COMMENT_PREFIX = 'xiaotuanbao-e2e:'
const E2E_KEEPER_APPLICATION_PREFIX = 'xiaotuanbao-e2e-keeper:'
const activeLeases = new Map<string, Client>()

interface SchemaComment {
  runId: string
  createdAtMs: number
}

export interface E2eDatabaseLease {
  databaseUrl: string
  runId: string
  schema: string
}

interface CommandResult {
  code: number
  signal: NodeJS.Signals | null
}

function assertPostgresUrl(databaseUrl: string): URL {
  const parsed = new URL(databaseUrl)
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('API E2E isolation requires a PostgreSQL DATABASE_URL')
  }
  return parsed
}

function assertSafeSchemaName(schema: string): void {
  if (!E2E_SCHEMA_PATTERN.test(schema)) {
    throw new Error(`Refusing to manage non-E2E schema: ${schema}`)
  }
}

function quoteSchema(schema: string): string {
  assertSafeSchemaName(schema)
  return `"${schema}"`
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function schemaComment(runId: string, createdAtMs: number): string {
  return `${E2E_SCHEMA_COMMENT_PREFIX}${runId}:${createdAtMs}`
}

function parseSchemaComment(comment: string | null): SchemaComment | null {
  if (!comment?.startsWith(E2E_SCHEMA_COMMENT_PREFIX)) {
    return null
  }
  const payload = comment.slice(E2E_SCHEMA_COMMENT_PREFIX.length)
  const separator = payload.lastIndexOf(':')
  if (separator < 1) {
    return null
  }
  const runId = payload.slice(0, separator)
  const createdAtMs = Number(payload.slice(separator + 1))
  if (!/^[a-z0-9_]+$/.test(runId) || !Number.isSafeInteger(createdAtMs) || createdAtMs < 0) {
    return null
  }
  return { runId, createdAtMs }
}

function baseDatabaseUrl(databaseUrl: string): string {
  const parsed = assertPostgresUrl(databaseUrl)
  parsed.searchParams.delete('schema')
  return parsed.toString()
}

export function createE2eRunId(
  now = new Date(),
  pid = process.pid,
  entropy = randomBytes(4).toString('hex'),
): string {
  const timestamp = now.toISOString().replace(/\D/g, '').slice(0, 14)
  return `${timestamp}_${pid}_${entropy.toLowerCase()}`
}

export function createIsolatedDatabaseUrl(databaseUrl: string, schema: string): string {
  assertSafeSchemaName(schema)
  const parsed = assertPostgresUrl(databaseUrl)
  parsed.searchParams.set('schema', schema)
  return parsed.toString()
}

async function withDatabaseClient<T>(databaseUrl: string, operation: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: baseDatabaseUrl(databaseUrl) })
  await client.connect()
  try {
    return await operation(client)
  } finally {
    await client.end()
  }
}

export async function cleanupStaleE2eSchemas(
  databaseUrl: string,
): Promise<string[]> {
  return withDatabaseClient(databaseUrl, async (client) => {
    const [schemas, activities] = await Promise.all([
      client.query<{ schema: string; comment: string | null }>(`
        SELECT nspname AS schema, obj_description(oid, 'pg_namespace') AS comment
        FROM pg_namespace
        WHERE nspname LIKE '${E2E_SCHEMA_PREFIX}%'
      `),
      client.query<{ applicationName: string }>(`
        SELECT application_name AS "applicationName"
        FROM pg_stat_activity
        WHERE application_name LIKE '${E2E_KEEPER_APPLICATION_PREFIX}%'
      `),
    ])
    const activeApplications = new Set(activities.rows.map((row) => row.applicationName))
    const removed: string[] = []
    for (const row of schemas.rows) {
      if (!E2E_SCHEMA_PATTERN.test(row.schema)) {
        continue
      }
      const marker = parseSchemaComment(row.comment)
      if (
        !marker ||
        activeApplications.has(`${E2E_KEEPER_APPLICATION_PREFIX}${marker.runId}`)
      ) {
        continue
      }
      await client.query(`DROP SCHEMA ${quoteSchema(row.schema)} CASCADE`)
      removed.push(row.schema)
    }
    return removed
  })
}

export async function prepareE2eDatabase(
  databaseUrl: string,
  now = new Date(),
): Promise<E2eDatabaseLease> {
  const runId = createE2eRunId(now)
  const schema = `${E2E_SCHEMA_PREFIX}${runId}`
  const keeper = new Client({
    connectionString: baseDatabaseUrl(databaseUrl),
    application_name: `${E2E_KEEPER_APPLICATION_PREFIX}${runId}`,
  })
  await keeper.connect()
  try {
    await cleanupStaleE2eSchemas(databaseUrl)
    await keeper.query('BEGIN')
    try {
      await keeper.query(`CREATE SCHEMA ${quoteSchema(schema)}`)
      await keeper.query(
        `COMMENT ON SCHEMA ${quoteSchema(schema)} IS ${quoteLiteral(
          schemaComment(runId, now.getTime()),
        )}`,
      )
      await keeper.query('COMMIT')
    } catch (error) {
      await keeper.query('ROLLBACK')
      throw error
    }
    activeLeases.set(runId, keeper)
  } catch (error) {
    await keeper.end()
    throw error
  }
  return {
    databaseUrl: createIsolatedDatabaseUrl(databaseUrl, schema),
    runId,
    schema,
  }
}

export async function dropE2eDatabase(
  databaseUrl: string,
  schema: string,
  runId: string,
): Promise<void> {
  assertSafeSchemaName(schema)
  const keeper = activeLeases.get(runId)
  activeLeases.delete(runId)
  await keeper?.end()
  await withDatabaseClient(databaseUrl, async (client) => {
    const result = await client.query<{ comment: string | null }>(
      `SELECT obj_description(oid, 'pg_namespace') AS comment
       FROM pg_namespace
       WHERE nspname = $1`,
      [schema],
    )
    if (result.rowCount === 0) {
      return
    }
    const marker = parseSchemaComment(result.rows[0]?.comment ?? null)
    if (!marker || marker.runId !== runId) {
      throw new Error(`Refusing to drop E2E schema without matching ownership marker: ${schema}`)
    }
    await client.query(`DROP SCHEMA ${quoteSchema(schema)} CASCADE`)
  })
}

export async function releaseE2eDatabaseLease(runId: string): Promise<void> {
  const keeper = activeLeases.get(runId)
  activeLeases.delete(runId)
  await keeper?.end()
}

export function runSetupCommand(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): void {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: 'inherit',
  })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with code ${result.status ?? 'unknown'}`)
  }
}

export function spawnTestCommand(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): { child: ChildProcess; completed: Promise<CommandResult> } {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: 'inherit',
  })
  const completed = new Promise<CommandResult>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code: code ?? 1, signal }))
  })
  return { child, completed }
}

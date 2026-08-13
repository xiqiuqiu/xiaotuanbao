import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { createAgentServer, loadAgentConfigFromEnv } from './server'

for (const file of [resolve(process.cwd(), '../../.env'), resolve(process.cwd(), '.env')]) {
  try {
    loadEnvFile(file)
    break
  } catch {
    // Docker / already-exported env
  }
}

const config = loadAgentConfigFromEnv()
const server = createAgentServer(config)

server.listen(config.port, '0.0.0.0', () => {
  process.stdout.write(`AI agent listening on ${config.port}\n`)
})

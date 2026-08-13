import { createAgentServer, loadAgentConfigFromEnv } from './server'

const config = loadAgentConfigFromEnv()
const server = createAgentServer(config)

server.listen(config.port, '0.0.0.0', () => {
  process.stdout.write(`AI agent listening on ${config.port}\n`)
})

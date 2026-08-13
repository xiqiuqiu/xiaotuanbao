import { createAgentServer, listAgentTools } from './server'
import { AddressInfo } from 'node:net'

describe('agent server', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('only exposes the readonly getTaskContext tool', () => {
    expect(listAgentTools()).toEqual(['getTaskContext'])
  })

  it('streams a readonly reply and maps agent unavailability', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 0,
        data: {
          task: {
            id: 'task-1',
            status: 'in_progress',
            currentPhase: 'basic_info',
            creatorUserId: 'user-1',
          },
          snapshot: {
            mode: 'manual',
            routeName: '川西线',
            name: '八月团',
            startDate: '2026-09-01',
            endDate: '2026-09-05',
            ownerUserId: 'user-1',
            departureType: 'combined',
          },
          objectVersion: 2,
          pending: { hasPendingReview: false, reviewPackageId: null },
          availableCapabilities: ['getTaskContext'],
          fieldCoverage: {
            filled: ['name', 'routeName', 'startDate', 'endDate', 'ownerUserId', 'departureType'],
            missing: [],
            optionalPresent: [],
          },
        },
      }),
    })

    const server = createAgentServer({
      port: 0,
      apiBaseUrl: 'http://api.local',
      serviceSecret: 'secret',
      allowedOrigins: ['http://localhost:5173'],
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo

    try {
      const response = await originalFetch(`http://127.0.0.1:${port}/copilotkit`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer deleg-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ taskId: 'task-1', runId: 'run-1' }),
      })
      const body = await response.text()
      expect(body).toContain('"type":"run.started"')
      expect(body).toContain('"type":"message.delta"')
      expect(body).toContain('必填基础信息已齐')
      expect(body).toContain('"type":"run.completed"')
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })

  it('emits a structured failure when the business API is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))

    const server = createAgentServer({
      port: 0,
      apiBaseUrl: 'http://api.local',
      serviceSecret: 'secret',
      allowedOrigins: ['http://localhost:5173'],
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo

    try {
      const response = await originalFetch(`http://127.0.0.1:${port}/copilotkit`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer deleg-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ taskId: 'task-1', runId: 'run-1' }),
      })
      const body = await response.text()
      expect(body).toContain('"type":"run.failed"')
      expect(body).toContain('AGENT_UNAVAILABLE')
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  })
})

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export async function startDeterministicParseWorker(options?: {
  text?: string
}): Promise<{
  origin: string
  holdNextCall: () => void
  release: () => void
  setPageText: (text: string) => void
  queuePageTexts: (texts: string[]) => void
  callCount: () => number
  receivedFilenames: () => string[]
  failNext: (status: number) => void
  close: () => Promise<void>
}> {
  let callCount = 0
  const receivedFilenames: string[] = []
  let hold: Promise<void> | null = null
  let releaseHold: (() => void) | null = null
  let pageText = options?.text ?? '九月川西线 预计 12 人'
  let queuedTexts: string[] = []
  let nextErrorStatus: number | null = null

  const server = createServer((request, response) => {
    void handle(request, response)
  })

  async function handle(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? '/', 'http://ocr.local')
    if (request.method === 'POST' && url.pathname === '/v1/parse') {
      const filename = contentDispositionFilename(request) ?? 'upload.bin'
      receivedFilenames.push(filename)
      await readBody(request)
      callCount += 1
      if (hold) {
        await hold
      }
      if (nextErrorStatus != null) {
        const status = nextErrorStatus
        nextErrorStatus = null
        json(response, status, { detail: { code: 'UNAVAILABLE', message: 'ocr 5xx' } })
        return
      }
      const text = queuedTexts.length > 0 ? queuedTexts.shift()! : pageText
      json(response, 200, {
        parserVersions: { deterministic: '1' },
        pages: [
          {
            pageNumber: 1,
            source: 'ocr',
            text,
          },
        ],
      })
      return
    }
    json(response, 404, { message: 'not found' })
  }

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address() as AddressInfo

  return {
    origin: `http://127.0.0.1:${address.port}`,
    holdNextCall: () => {
      hold = new Promise((resolve) => {
        releaseHold = resolve
      })
    },
    release: () => {
      releaseHold?.()
      hold = null
      releaseHold = null
    },
    setPageText: (text: string) => {
      pageText = text
      queuedTexts = []
    },
    queuePageTexts: (texts: string[]) => {
      queuedTexts = [...texts]
    },
    callCount: () => callCount,
    receivedFilenames: () => [...receivedFilenames],
    failNext: (status: number) => {
      nextErrorStatus = status
    },
    close: () =>
      new Promise((resolve, reject) => {
        releaseHold?.()
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}

function contentDispositionFilename(request: IncomingMessage): string | null {
  const contentType = String(request.headers['content-type'] ?? '')
  const match = /filename="?([^";]+)"?/i.exec(contentType)
  return match?.[1] ?? null
}

function json(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

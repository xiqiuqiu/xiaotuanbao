import type { IncomingMessage, ServerResponse } from 'node:http'
import { AiCollaborationError } from '@xiaotuanbao/ai-contracts'

export function statusForCollaborationError(error: AiCollaborationError): number {
  if (error.code === 'DELEGATION_INVALID') {
    return 401
  }
  if (error.code === 'VERSION_CONFLICT' || error.code === 'REVIEW_PENDING') {
    return 409
  }
  if (error.code === 'PERMISSION_DENIED' || error.code === 'SERVICE_IDENTITY_INVALID') {
    return 403
  }
  return error.retryable ? 503 : 400
}

export function json(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

export function readBearer(request: IncomingMessage): string {
  const header = request.headers.authorization ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

export function readHeader(request: IncomingMessage, name: string): string {
  const value = request.headers[name]
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? ''
  }
  return value?.trim() ?? ''
}

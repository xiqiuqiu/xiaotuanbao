import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

export interface ParsedMaterialPage {
  pageNumber: number
  source: 'native_pdf' | 'ocr'
  text: string
  markdown?: string
  width?: number
  height?: number
  dpi?: number
  lines: Array<{
    text: string
    score?: number
    box?: number[]
    coordinateSystem: 'pdf_point' | 'pixel'
  }>
}

export interface ParsedMaterialResult {
  parserVersions: Record<string, string>
  fallbackUsed: boolean
  pages: ParsedMaterialPage[]
}

@Injectable()
export class ParseWorkerClient {
  private readonly logger = new Logger(ParseWorkerClient.name)

  constructor(private readonly configService: ConfigService) {}

  async parse(file: { buffer: Buffer; filename: string; contentType: string }): Promise<ParsedMaterialResult> {
    const baseUrl = this.configService.get<string>('app.materialParse.baseUrl') ?? 'http://127.0.0.1:8089'
    const timeoutMs = this.configService.get<number>('app.materialParse.requestTimeoutMs') ?? 60_000
    const token = this.configService.get<string>('app.materialParse.serviceToken') ?? ''

    const body = new FormData()
    body.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.contentType }),
      file.filename,
    )

    const headers: Record<string, string> = {}
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(`${baseUrl}/v1/parse`, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      })
      const payload = (await response.json().catch(() => null)) as {
        pages?: ParsedMaterialPage[]
        parserVersions?: Record<string, string>
        fallbackUsed?: boolean
        detail?: { code?: string; message?: string }
      } | null
      if (!response.ok) {
        this.logger.warn(`parse worker rejected status=${response.status} code=${payload?.detail?.code ?? ''}`)
        throw new ServiceUnavailableException(payload?.detail?.message ?? '资料解析服务不可用')
      }
      return {
        parserVersions: payload?.parserVersions ?? {},
        fallbackUsed: Boolean(payload?.fallbackUsed),
        pages: payload?.pages ?? [],
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error
      }
      this.logger.warn(`parse worker failed: ${error instanceof Error ? error.message : 'unknown'}`)
      throw new ServiceUnavailableException('资料解析服务不可用')
    } finally {
      clearTimeout(timer)
    }
  }
}

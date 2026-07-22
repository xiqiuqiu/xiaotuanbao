import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ProductImportService } from './product-import.service'

const FIXTURE_PATH = join(__dirname, '../../../test/fixtures/jiangyouji-daba-sample.xlsx')

describe('ProductImportService.createSession', () => {
  const organizationId = 'org-1'
  const userId = 'user-1'
  const file = {
    originalname: '疆游记.xlsx',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: readFileSync(FIXTURE_PATH),
    size: 0,
  }
  file.size = file.buffer.byteLength

  it('会话创建失败时清理已上传的 StoredObject', async () => {
    const stored = {
      id: 'stored-1',
      originalFilename: file.originalname,
      contentType: file.mimetype,
      sizeBytes: file.size,
      createdAt: new Date().toISOString(),
      createdByUserId: userId,
    }
    const createError = new Error('db unavailable')
    const prisma = {
      productImportSession: {
        create: jest.fn().mockRejectedValue(createError),
      },
    }
    const storedObjectService = {
      upload: jest.fn().mockResolvedValue(stored),
      delete: jest.fn().mockResolvedValue(undefined),
    }
    const productService = {}
    const service = new ProductImportService(
      prisma as never,
      storedObjectService as never,
      productService as never,
    )

    await expect(service.createSession(organizationId, userId, file)).rejects.toThrow(
      createError,
    )

    expect(storedObjectService.upload).toHaveBeenCalledWith(organizationId, userId, file)
    expect(storedObjectService.delete).toHaveBeenCalledWith(organizationId, stored.id)
  })
})

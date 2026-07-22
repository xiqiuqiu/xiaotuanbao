import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { PrismaService } from '../src/database/prisma/prisma.service'
import { STORED_OBJECT_MAX_UPLOAD_BYTES } from '../src/modules/stored-object/stored-object.constants'
import { authRequest, createTestApp, loginAs, uniqueBusinessPrefix } from './helpers'

const TEST_ORIGIN = 'http://localhost:5173'

function parseBinaryBody() {
  return (res: request.Response, callback: (err: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = []
    res.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    res.on('end', () => callback(null, Buffer.concat(chunks)))
  }
}

describe('StoredObject / FileStore (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let coordinatorToken: string
  const testPrefix = `e2e-so-${Date.now().toString(36)}`

  beforeAll(async () => {
    app = await createTestApp()
    prisma = app.get(PrismaService)
    coordinatorToken = await loginAs(app, 'wangjie')
  })

  afterAll(async () => {
    await prisma.storedObject.deleteMany({
      where: { originalFilename: { startsWith: testPrefix } },
    })
    await app.close()
  })

  it('rejects unauthenticated upload and download', async () => {
    await request(app.getHttpServer())
      .post('/api/stored-objects')
      .set('Origin', TEST_ORIGIN)
      .attach('file', Buffer.from('secret'), `${testPrefix}-unauth.bin`)
      .expect(401)

    await request(app.getHttpServer()).get('/api/stored-objects/nonexistent').expect(401)
  })

  it('rejects missing file part', async () => {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/stored-objects')
      .expect(400)

    expect(response.body.message).toMatch(/上传|file/i)
  })

  it('rejects empty file', async () => {
    const response = await authRequest(app, coordinatorToken)
      .post('/api/stored-objects')
      .attach('file', Buffer.alloc(0), `${testPrefix}-empty.bin`)
      .expect(400)

    expect(response.body.message).toMatch(/空/)
  })

  it('rejects oversize upload', async () => {
    const oversize = Buffer.alloc(STORED_OBJECT_MAX_UPLOAD_BYTES + 1, 1)
    const response = await authRequest(app, coordinatorToken)
      .post('/api/stored-objects')
      .attach('file', oversize, `${testPrefix}-big.bin`)
      .expect(413)

    expect(String(response.body.message ?? '')).toMatch(/过大|large|50MB/i)
  })

  it('uploads then downloads the same bytes with Content-Disposition', async () => {
    const payload = Buffer.from(`hello-stored-object-${testPrefix}-中文`)
    const filename = `${testPrefix}-往返.xlsx`

    const upload = await authRequest(app, coordinatorToken)
      .post('/api/stored-objects')
      .attach('file', payload, {
        filename,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .expect(201)

    expect(upload.body.code).toBe(0)
    expect(upload.body.data).toMatchObject({
      originalFilename: filename,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: payload.byteLength,
    })
    expect(typeof upload.body.data.id).toBe('string')
    expect(upload.body.data.id.length).toBeGreaterThan(8)

    const id = upload.body.data.id as string
    const download = await authRequest(app, coordinatorToken)
      .get(`/api/stored-objects/${id}`)
      .buffer(true)
      .parse(parseBinaryBody())
      .expect(200)

    expect(download.headers['content-type']).toMatch(
      /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/,
    )
    const disposition = String(download.headers['content-disposition'] ?? '')
    expect(disposition).toMatch(/attachment/)
    const filenameStar = disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? ''
    expect(decodeURIComponent(filenameStar)).toBe(filename)
    expect(Buffer.isBuffer(download.body)).toBe(true)
    expect(download.body.equals(payload)).toBe(true)
    expect(download.body.subarray(0, 1).toString('utf8')).not.toBe('{')
  })

  it('denies cross-organization download and delete with 404', async () => {
    const otherOrg = await prisma.organization.create({
      data: {
        name: `${testPrefix}-other-org`,
        businessPrefix: uniqueBusinessPrefix(`${testPrefix}-x`),
      },
    })
    const foreignUser = await prisma.user.findFirst({
      where: { organizationId: { not: otherOrg.id }, deletedAt: null },
      select: { id: true },
    })
    if (!foreignUser) {
      throw new Error('seed user required for foreign StoredObject creator FK')
    }

    const foreign = await prisma.storedObject.create({
      data: {
        organizationId: otherOrg.id,
        objectKey: `orgs/${otherOrg.id}/${testPrefix}-foreign`,
        originalFilename: `${testPrefix}-foreign.bin`,
        contentType: 'application/octet-stream',
        sizeBytes: 3,
        createdByUserId: foreignUser.id,
      },
    })

    await authRequest(app, coordinatorToken)
      .get(`/api/stored-objects/${foreign.id}`)
      .expect(404)

    await authRequest(app, coordinatorToken)
      .delete(`/api/stored-objects/${foreign.id}`)
      .expect(404)

    const stillThere = await prisma.storedObject.findUnique({ where: { id: foreign.id } })
    expect(stillThere).not.toBeNull()

    await prisma.storedObject.delete({ where: { id: foreign.id } })
    await prisma.organization.delete({ where: { id: otherOrg.id } })
  })

  it('deletes then returns 404 on download', async () => {
    const payload = Buffer.from(`${testPrefix}-to-delete`)
    const upload = await authRequest(app, coordinatorToken)
      .post('/api/stored-objects')
      .attach('file', payload, `${testPrefix}-delete.bin`)
      .expect(201)

    const id = upload.body.data.id as string
    await authRequest(app, coordinatorToken).delete(`/api/stored-objects/${id}`).expect(204)
    await authRequest(app, coordinatorToken).get(`/api/stored-objects/${id}`).expect(404)
  })
})

import { listenConnectionString } from './agent-live-output.postgres'

describe('listenConnectionString', () => {
  it('strips Prisma-only query params so pg LISTEN can connect', () => {
    expect(
      listenConnectionString(
        'postgresql://xiaotuanbao:secret@127.0.0.1:5432/xiaotuanbao?schema=public&connection_limit=20',
      ),
    ).toBe('postgresql://xiaotuanbao:secret@127.0.0.1:5432/xiaotuanbao')
  })
})

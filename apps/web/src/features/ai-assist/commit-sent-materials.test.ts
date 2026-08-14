import { describe, expect, it, vi } from 'vitest'
import { collectSentAttachmentBlobUrls, commitPendingMaterials } from './commit-sent-materials'

describe('collectSentAttachmentBlobUrls', () => {
  it('returns blob urls from sent file parts', () => {
    expect(
      collectSentAttachmentBlobUrls([
        { type: 'text', text: '帮我看看' },
        { type: 'document', source: { type: 'url', value: 'blob:pdf-1' } },
        { type: 'image', source: { type: 'url', value: 'https://example.com/a.png' } },
      ]),
    ).toEqual(['blob:pdf-1'])
  })

  it('ignores string content', () => {
    expect(collectSentAttachmentBlobUrls('请查看附件')).toEqual([])
  })
})

describe('commitPendingMaterials', () => {
  it('uploads each pending file once after send', async () => {
    const file = new File(['pdf'], '行程.pdf', { type: 'application/pdf' })
    const pendingFiles = new Map<string, File>([['blob:pdf-1', file]])
    const committedUrls = new Set<string>()
    const upload = vi.fn().mockResolvedValue({ id: 'mat-1' })

    await expect(
      commitPendingMaterials({
        taskId: 'task-1',
        blobUrls: ['blob:pdf-1', 'blob:pdf-1'],
        pendingFiles,
        committedUrls,
        upload,
      }),
    ).resolves.toBe(1)

    expect(upload).toHaveBeenCalledTimes(1)
    expect(upload).toHaveBeenCalledWith('task-1', file)
    expect(pendingFiles.size).toBe(0)
  })

  it('does not upload files that were never sent', async () => {
    const pendingFiles = new Map<string, File>([
      ['blob:kept', new File(['x'], '未发送.pdf', { type: 'application/pdf' })],
    ])
    const upload = vi.fn()

    await expect(
      commitPendingMaterials({
        taskId: 'task-1',
        blobUrls: [],
        pendingFiles,
        committedUrls: new Set(),
        upload,
      }),
    ).resolves.toBe(0)

    expect(upload).not.toHaveBeenCalled()
    expect(pendingFiles.size).toBe(1)
  })
})

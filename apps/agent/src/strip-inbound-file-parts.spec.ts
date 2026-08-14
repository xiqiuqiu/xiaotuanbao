import { stripInboundFileParts } from './strip-inbound-file-parts'

describe('stripInboundFileParts', () => {
  it('replaces file and image parts with a material pointer and drops urls', () => {
    const stripped = stripInboundFileParts({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '看看这个行程单' },
            {
              type: 'image',
              image: 'data:image/png;base64,aaaa',
              metadata: { materialId: 'mat-1', filename: '行程.png' },
            },
            {
              type: 'file',
              data: 'JVBERi0x',
              mimeType: 'application/pdf',
              filename: '行程.pdf',
              metadata: { materialId: 'mat-2' },
            },
          ],
        },
      ],
    })

    expect(stripped).toEqual({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '看看这个行程单' },
            { type: 'text', text: '[发团资料档案] materialId=mat-1 filename=行程.png' },
            { type: 'text', text: '[发团资料档案] materialId=mat-2 filename=行程.pdf' },
          ],
        },
      ],
    })
    expect(JSON.stringify(stripped)).not.toContain('base64')
    expect(JSON.stringify(stripped)).not.toContain('JVBERi0x')
  })

  it('drops attachment bags and keeps only the archive pointer', () => {
    const stripped = stripInboundFileParts({
      role: 'user',
      content: '已附上',
      attachments: [
        {
          type: 'file',
          url: 'https://example.test/secret.pdf',
          metadata: { materialId: 'mat-9', filename: 'secret.pdf' },
        },
      ],
    })

    expect(stripped).toEqual({
      role: 'user',
      content: '已附上\n[发团资料档案] materialId=mat-9 filename=secret.pdf',
    })
    expect(JSON.stringify(stripped)).not.toContain('example.test')
  })
})

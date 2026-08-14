import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('AiCreateAssistChat composer CSS', () => {
  const css = readFileSync(resolve(__dirname, './AiCreateAssistChat.module.css'), 'utf8')

  it('keeps the input overlay opaque so message text cannot show through attachments', () => {
    expect(css).toContain("[data-testid='copilot-input-overlay']")
    expect(css).toContain('background-color: var(--ant-color-bg-container)')
    expect(css).not.toContain('background-color: transparent')
  })

  it('joins the attachment queue and input into one composer card', () => {
    expect(css).toContain("[data-testid='copilot-attachment-queue']")
    expect(css).toContain('border-bottom: 0')
    expect(css).toContain('box-shadow: none')
    expect(css).toContain('--assist-composer-radius')
  })
})

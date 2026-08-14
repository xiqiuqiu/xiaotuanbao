import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(__dirname, './AiCreateAssistChat.module.css'), 'utf8')

describe('AiCreateAssistChat motion CSS', () => {
  it('staggers the welcome enter and disables it under reduced motion', () => {
    expect(css).toMatch(/\.welcomeMain > \*\s*\{[\s\S]*welcome-enter 240ms ease-out both/)
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.welcomeMain > \*\s*\{[\s\S]*animation:\s*none/,
    )
  })
})

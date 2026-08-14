import { describe, expect, it } from 'vitest'
import { greetingForHour } from './AiCreateAssistWelcome'

describe('greetingForHour', () => {
  it('uses morning, afternoon and evening bands', () => {
    expect(greetingForHour(8)).toBe('上午好')
    expect(greetingForHour(14)).toBe('下午好')
    expect(greetingForHour(20)).toBe('晚上好')
  })
})

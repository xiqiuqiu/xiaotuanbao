import { normalizeUsername } from './username'

describe('normalizeUsername', () => {
  it('trims and lowercases login usernames', () => {
    expect(normalizeUsername(' Admin ')).toBe('admin')
    expect(normalizeUsername('WangJie')).toBe('wangjie')
  })
})

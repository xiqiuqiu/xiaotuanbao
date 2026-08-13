import { READONLY_ASSIST_INSTRUCTIONS } from './readonly-turn'

describe('READONLY_ASSIST_INSTRUCTIONS', () => {
  it('requires getTaskContext and forbids writes or snapshot invention', () => {
    expect(READONLY_ASSIST_INSTRUCTIONS).toContain('只读助手')
    expect(READONLY_ASSIST_INSTRUCTIONS).toContain('必须调用 getTaskContext')
    expect(READONLY_ASSIST_INSTRUCTIONS).toContain('只提出一个下一步问题')
    expect(READONLY_ASSIST_INSTRUCTIONS).toContain('不要声称会改写草稿')
    expect(READONLY_ASSIST_INSTRUCTIONS).toContain('团名、路线')
    expect(READONLY_ASSIST_INSTRUCTIONS).not.toContain('只能根据用户消息里的业务快照')
  })
})

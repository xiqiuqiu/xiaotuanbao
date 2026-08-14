import { READONLY_ASSIST_INSTRUCTIONS } from './readonly-turn'

describe('READONLY_ASSIST_INSTRUCTIONS', () => {
  it('requires getTaskContext, allows submitReviewPackage, and forbids draft writes', () => {
    expect(READONLY_ASSIST_INSTRUCTIONS).toContain('必须先调用 getTaskContext')
    expect(READONLY_ASSIST_INSTRUCTIONS).toContain('conversationEvents')
    expect(READONLY_ASSIST_INSTRUCTIONS).toContain('submitReviewPackage')
    expect(READONLY_ASSIST_INSTRUCTIONS).toContain('负责人和发团类型必须由 User 在表单选择')
    expect(READONLY_ASSIST_INSTRUCTIONS).toContain('pending.hasPendingReview')
    expect(READONLY_ASSIST_INSTRUCTIONS).toContain('必须调用前端 awaitReviewPackageDecision')
    expect(READONLY_ASSIST_INSTRUCTIONS).toContain('重新调用 getTaskContext')
    expect(READONLY_ASSIST_INSTRUCTIONS).toContain('随后结束本轮')
    expect(READONLY_ASSIST_INSTRUCTIONS).toContain('不得追问、引导或自动重新提交')
    expect(READONLY_ASSIST_INSTRUCTIONS).toContain('不要声称已经改写草稿')
    expect(READONLY_ASSIST_INSTRUCTIONS).toContain('searchRouteTemplates')
    expect(READONLY_ASSIST_INSTRUCTIONS).toContain('已有 templateId 时不要主动搜索或替换')
    expect(READONLY_ASSIST_INSTRUCTIONS).toContain('只转述')
    expect(READONLY_ASSIST_INSTRUCTIONS).toContain('matchReasons')
    expect(READONLY_ASSIST_INSTRUCTIONS).toContain('不阻断手动创建')
    expect(READONLY_ASSIST_INSTRUCTIONS).toContain('团名、路线、常用路线')
    expect(READONLY_ASSIST_INSTRUCTIONS).not.toContain('只能根据用户消息里的业务快照')
  })
})

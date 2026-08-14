export const AI_CREATE_FIRST_TURN =
  '请根据当前草稿说明已填写和仍缺少的信息，并只问一个下一步问题。'

export const AI_CREATE_CONSUME_MATERIALS_TURN =
  '资料已解析，请调用 getTaskContext 查看资料摘要，对可用档案调用 getMaterialParseResult 读取全文，只根据解析结果为团名、路线、日期/天数、预计人数提示提交带 material_region 证据的候选。解析未完成或失败的档案不要编造字段。'

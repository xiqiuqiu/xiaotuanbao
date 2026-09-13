export interface BusinessAcceptanceMaterial {
  id: string
  title: string
  kind: 'plaintext'
  body: string
  anchors: readonly string[]
}

export const businessAcceptanceMaterials = [
  {
    id: 'material.explicit-total-price',
    title: '明确总价的酒店确认',
    kind: 'plaintext',
    body: [
      '对象：已有发团「黄山三日」4月2日行程段。',
      '车队对接：4月2日住宿已确认，挂云上酒店，最终约定总价 8800 元含早，不再按间夜拆。',
      '未写房型与间数。',
    ].join('\n'),
    anchors: ['8800 元', '云上酒店', '不再按间夜拆'],
  },
  {
    id: 'material.ambiguous-attribution',
    title: '跨日用车未标明行程段',
    kind: 'plaintext',
    body: [
      '对象：已有发团「黄山三日」，行程含 4月2日接站、4月3日至4月4日景交两段。',
      '金桥车队报价：4月2日到4月4日用车一共 3600 元。',
      '材料未说明该笔费用挂接站段还是景交段，也未写成发团级。',
    ].join('\n'),
    anchors: ['4月2日到4月4日用车', '3600 元', '未说明'],
  },
  {
    id: 'material.same-name-suppliers',
    title: '同名酒店供应商',
    kind: 'plaintext',
    body: [
      '对象：已有发团「黄山三日」4月3日住宿。',
      '计调备注：住宿挂云上酒店，约定总价 5600 元。',
      '组织名录现有两家有效酒店供应商：云上酒店（杭州）、云上酒店（黄山）。材料未写城市。',
    ].join('\n'),
    anchors: ['云上酒店（杭州）', '云上酒店（黄山）', '材料未写城市'],
  },
  {
    id: 'material.discount-adjustment',
    title: '报价含增减与整单优惠',
    kind: 'plaintext',
    body: [
      '对象：已有发团「黄山三日」。客户：青禾旅行社。',
      '报名：8 成人，成人价 6800 元；2 儿童，儿童价 4200 元。',
      '调整：单房差 +600 元；住宿扣减 −400 元。',
      '优惠：整单优惠 2000 元。',
      '收款：分拆，客户已收定金 20000 元，我方收尾款 41000 元。',
    ].join('\n'),
    anchors: ['8 成人', '6800 元', '4200 元', '+600 元', '−400 元', '整单优惠 2000 元'],
  },
  {
    id: 'material.incomplete-guest-list',
    title: '客人人数多于已给名单',
    kind: 'plaintext',
    body: [
      '对象：已有发团「黄山三日」。客户：青禾旅行社。',
      '客源单人数：成人 8、儿童 2，共 10 人。',
      '已给名单 8 人：李明、王芳、张伟、赵敏、陈强、刘洋、周杰、吴静。',
      '其余两人仅写“后续补名单”，未给姓名。电话均未提供。',
    ].join('\n'),
    anchors: ['共 10 人', '已给名单 8 人', '后续补名单', '电话均未提供'],
  },
  {
    id: 'material.ocr-conflict',
    title: 'OCR 金额与文字约定冲突',
    kind: 'plaintext',
    body: [
      '对象：已有发团「黄山三日」4月2日住宿。',
      '聊天原文：酒店最终按 8800 元结。',
      '扫描件 OCR：云上酒店 9800 元。',
      '两处金额不一致，没有写以哪一处为准。',
    ].join('\n'),
    anchors: ['8800 元', '9800 元', '两处金额不一致'],
  },
] as const satisfies readonly BusinessAcceptanceMaterial[]

export const businessAcceptanceFieldMaterials = [
  {
    id: 'field.unknown-not-zero',
    title: '只写成人报价，未提儿童、优惠与调整',
    kind: 'plaintext',
    body: [
      '对象：已有发团「黄山三日」。客户：青禾旅行社。',
      '报名：8 成人，成人价 6800 元。',
      '未写儿童、团款调整或优惠。',
    ].join('\n'),
    anchors: ['8 成人', '6800 元', '未写儿童、团款调整或优惠'],
  },
  {
    id: 'field.explicit-zero',
    title: '明确无优惠且仅儿童出团',
    kind: 'plaintext',
    body: [
      '对象：已有发团「黄山三日」。客户：青禾旅行社。',
      '报名：成人 0 人，儿童 2 人，儿童价 4200 元。',
      '优惠：无优惠。',
    ].join('\n'),
    anchors: ['成人 0 人', '无优惠'],
  },
] as const satisfies readonly BusinessAcceptanceMaterial[]

export function allBusinessAcceptanceMaterials(): readonly BusinessAcceptanceMaterial[] {
  return [...businessAcceptanceMaterials, ...businessAcceptanceFieldMaterials]
}

export function findBusinessAcceptanceMaterial(
  id: string,
  materials: readonly BusinessAcceptanceMaterial[] = allBusinessAcceptanceMaterials(),
): BusinessAcceptanceMaterial | undefined {
  return materials.find((item) => item.id === id)
}

export function materialContainsAnchors(material: BusinessAcceptanceMaterial): boolean {
  return material.anchors.every((anchor) => material.body.includes(anchor))
}

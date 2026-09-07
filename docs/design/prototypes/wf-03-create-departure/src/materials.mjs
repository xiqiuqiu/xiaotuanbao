// ponytail: exact, visible fixtures simulate extraction; arbitrary files/text never generate fixture facts.
export const materials = {
 create: {name:'关西行程示例.txt',text:'请根据以下行程建团：日本关西赏樱 6 日，2026-04-02 至 04-07，计划 32 人，负责人张晓彤，独立团，联系电话13800002048，交通承运方关西交通，导游王卓，参考常用路线关西赏樱6日。D1 大阪抵达；D2 京都游览；D3 奈良游览；D4 大阪自由行；D5 大阪游览；D6 返程。'},
 source: {name:'华东报名材料示例.txt',text:'请录入当前关西团的客源。客户：华东旅行社。成人8位，每人6800元；儿童2位，每人4200元；调整0元，优惠2000元，客户结算。\n名单：张伟，成人，34岁，138****1234；李娜，成人，32岁，138****5678；王强，成人，40岁，138****5678；陈静，成人，29岁，139****4821；刘洋，成人，36岁，136****7712；赵敏，成人，33岁，137****3390；刘童童，儿童，6岁，联系随行人；孙琪，成人，38岁，135****6808；周芳，成人，31岁，186****2901；赵悦，儿童，6岁，138****9876。'},
 resources: {name:'资源确认材料示例.txt',text:'请将以下确认信息录入当前关西团。4月2日大阪入住：大阪樱花酒店，16间双床房，450元/间，总价7200元，含早餐，可住32人。4月2日关西机场至大阪：供应商关西交通，28个乘客座位巴士，总价2400元。4月3日京都午餐：供应商京都和食，32人，每人100元，总价3200元。请对照本团计划32人核对。'},
 supplement: {name:'车队补充材料示例.txt',text:'补充当前关西团4月2日机场接送：关西交通确认换为35个可用乘客座位的巴士，总价2800元。其余安排不变。'},
};
materials.combined={name:'名单与资源联合材料示例.txt',text:materials.source.text+'\n\n'+materials.resources.text};
export function materialKinds(text) {
 if(text.trim()===materials.combined.text)return ['source','resources'];
 return Object.entries(materials).filter(([,m])=>m.text.trim()===text.trim()).map(([key])=>key);
}

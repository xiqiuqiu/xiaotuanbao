// In-memory prototype; amounts use cents, business persistence belongs to the server.
const cents = n => Math.round((n ?? 0) * 100);
export const adjustments = [
 ['child_ticket', '儿童门票补款', 'increase'], ['single_room', '单房差补款', 'increase'],
 ['extra_night', '续住费用', 'increase'], ['ticket_refund', '门票优惠退差', 'decrease'],
 ['hotel_deduction', '住宿费用扣减', 'decrease'], ['other', '其他费用调整', null],
];
export const adjustmentName = row => adjustments.find(([kind]) => kind === row.kind)?.[1] ?? '待选择项目';
export function sourceAmounts(v) {
 const gross = cents(v.adultPrice) * v.adults + cents(v.childPrice) * v.children;
 const adjustment = v.adjustments.reduce((sum, a) => sum + (a.direction === 'increase' ? 1 : -1) * cents(a.amount), 0);
 const discount = v.discountType === 'none' ? 0 : cents(v.discount);
 const net = gross + adjustment - discount;
 const guest = v.collectionMode === 'partner' ? 0 : cents(v.balance) + (v.collectionMode === 'guest' ? cents(v.deposit) : 0);
 return {gross:gross/100, adjustment:adjustment/100, discount:discount/100, net:net/100, guestAmount:guest/100, topUp:Math.max(0,net-guest)/100, rebate:Math.max(0,guest-net)/100};
}
export function sourceErrors(v) {
 const valid = n => Number.isFinite(n) && n >= 0;
 const money = n => valid(n) && Math.abs(n*100-Math.round(n*100)) < 0.000001;
 const errors = [];
 if (!v.partner.trim()) errors.push('请补充客户');
 if (![v.adults,v.children].every(n=>valid(n)&&Number.isInteger(n)) || v.adults+v.children<1) errors.push('请核对成人和儿童人数');
 if ((v.adults>0&&!money(v.adultPrice)) || (v.children>0&&!money(v.childPrice))) errors.push('请补充人民币单价，最多两位小数');
 const kinds = new Set();
 for (const row of v.adjustments) {
  const entry = adjustments.find(([kind])=>kind===row.kind);
  if (!entry || !money(row.amount) || row.amount<=0 || !['increase','decrease'].includes(row.direction) || (entry[2]&&entry[2]!==row.direction) || (row.kind==='other'&&!row.customName?.trim())) errors.push('请核对调整类别、方向、正金额和说明');
  if (row.kind!=='other'&&kinds.has(row.kind)) errors.push('同类固定调整须先核对是否重复，再按依据汇总为一行');
  kinds.add(row.kind);
 }
 if (!['none','lump'].includes(v.discountType) || (v.discountType!=='none'&&!money(v.discount))) errors.push('请补充优惠方式及人民币金额');
 if (!['partner','guest','split'].includes(v.collectionMode)) errors.push('请明确收款方式');
 if (v.collectionMode!=='partner'&&(!money(v.deposit)||!money(v.balance))) errors.push('请补齐定金和尾款约定');
 if (v.collectionMode!=='partner'&&sourceAmounts(v).guestAmount<=0) errors.push('我方代收约定须大于零');
 if (sourceAmounts(v).net<0) errors.push('优惠和减项不能使结算金额小于零');
 return errors;
}
export function initialReceivables(source, net) {
 const row = (id,title,partner,amount)=>({id,origin:'source',title,partner,direction:'收入',amount});
 if (source.collectionMode==='partner') return [row('AR-PARTNER','客户补款',source.partner,net)].filter(r=>r.amount>0);
 const guest = (cents(source.balance)+(source.collectionMode==='guest'?cents(source.deposit):0))/100;
 return [
  ...(source.collectionMode==='guest'?[row('AR-DEPOSIT','定金代收','本团游客',source.deposit)]:[]),
  row('AR-BALANCE','尾款代收','本团游客',source.balance),
  row('AR-PARTNER','客户补款',source.partner,Math.max(0,cents(net)-cents(guest))/100),
 ].filter(r=>r.amount>0);
}
export function switchCollection(draft, mode, saved) {
 saved[draft.collectionMode] = {deposit:draft.deposit,balance:draft.balance};
 return {...draft,collectionMode:mode,...(saved[mode]??{deposit:null,balance:null})};
}

// Static supplier directory for the demo, not a production lookup.
export const resourceKinds = ['用车','酒店','导游','拼出','门票','用餐','保险','其他'];
export const suppliers = {'大阪樱花酒店':['酒店'],'关西交通':['用车'],'京都和食':['用餐']};
export const resourceErrors = group => [
 ...(!group.title?.trim()?['请补充项目名称']:[]),
 ...(!suppliers[group.supplier]?.includes(group.kind)?['请匹配支持该资源类别的供应商']:[]),
 ...(!Number.isFinite(group.amount)||group.amount<=0||Math.abs(group.amount*100-Math.round(group.amount*100))>0.000001?['总价须为正人民币金额，最多两位小数']:[]),
];
export const blocked = group => resourceErrors(group).length>0;
export const capacityWarning = group => group.evidenceCapacity != null && group.evidenceCapacity < 32;
export const reviseGroup = (groups,id,patch) => groups.map(group => group.id===id&&!group.written?{...group,...patch,version:group.version+1}:group);
export const confirmGroups = (groups,ids) => groups.map(group => ids.includes(group.id)&&!group.written&&!blocked(group)?{...group,written:true}:group);

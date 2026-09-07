// Throwaway WF-05: validate date grouping and independent resource confirmation.
import { useEffect, useState } from "react";
import { blocked, capacityWarning, resourceErrors, resourceKinds, suppliers, reviseGroup, confirmGroups } from "./resource-model.mjs";
import { Button, Checkbox, Form, Input, InputNumber, Select, Tag } from "antd";
import { FileTextOutlined } from "@ant-design/icons";

export const initialGroups = [
  { id: 'hotel', date: '2026-04-02', segment: '大阪入住', title: '大阪樱花酒店 · 双床房', kind: '酒店', supplier: '大阪樱花酒店', amount: 7200, evidenceCapacity: 32, notes: '16 间双床房，含早餐', evidence: '用户提供的资源材料 · 酒店：16 间 × 450 元', version: 1, written: false },
  { id: 'bus', date: '2026-04-02', segment: '关西机场 → 大阪', title: '机场接送 · 28 座巴士', kind: '用车', supplier: '关西交通', amount: 2400, evidenceCapacity: 28, notes: '32 位游客，28 个可用乘客座位', evidence: '用户提供的资源材料 · 接送：28 座 / 2,400 元', version: 1, written: false },
  { id: 'meal', date: '2026-04-03', segment: '京都午餐', title: '京都团餐 · 32 人', kind: '用餐', supplier: '京都和食', amount: 3200, evidenceCapacity: 32, notes: '32 人套餐，100 元 / 人', evidence: '用户提供的资源材料 · 团餐：32 人 × 100 元', version: 1, written: false },
];
const money = (value) => `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;


function ResourceEdit({ group, onSave, onCancel }) {
  const [form] = Form.useForm();
  return <div className="precisionEdit">
    <div className="precisionEditIntro"><div><strong>编辑资源提案</strong><small>{group.date} · {group.segment} · 保存后重新校验供应商类别与总价</small></div><Tag>v{group.version}</Tag></div>
    <Form form={form} layout="vertical" initialValues={group} onFinish={onSave}>
      <Form.Item name="kind" label="资源种类" rules={[{ required: true }]}><Select options={resourceKinds.map(value => ({ value, label: value }))} /></Form.Item>
      <Form.Item name="supplier" label="供应商" rules={[{ required: true, whitespace: true, message: '请填写供应商' }]}><Select options={Object.keys(suppliers).map(value=>({value,label:value}))}/></Form.Item>
      <Form.Item name="title" label="资源名称" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
      <Form.Item name="amount" label="资源金额（人民币元）" rules={[{ required: true, type: 'number', min: 0.01 }]}><InputNumber min={0.01} /></Form.Item>
      <Form.Item name="notes" label="备注（可填写费用明细与服务范围）"><Input.TextArea rows={3} /></Form.Item>
    </Form>
    <div className="precisionEditActions"><Button onClick={onCancel}>取消</Button><Button type="primary" onClick={() => form.submit()}>保存并返回审核</Button></div>
  </div>;
}

export function ResourcePrototype({ objectPanel, agentPanel, groups, setGroups, onRecord, onWritten, onContinuePayable }) {

  const [selected, setSelected] = useState([]);
  useEffect(() => setSelected([]), [groups]);
  const [phase, setPhaseState] = useState('review');
  const setPhase = (next) => next === "record" ? onRecord() : setPhaseState(next);
  const [editing, setEditing] = useState(null);
  const [lastWritten, setLastWritten] = useState([]);
  const selectedGroups = groups.filter(group => selected.includes(group.id) && !group.written && !blocked(group));
  const total = selectedGroups.reduce((sum, group) => sum + Math.round(group.amount * 100), 0) / 100;
  const pending = groups.filter(group => !group.written);
  const written = groups.filter(group => group.written);
  const updateGroup = (id, patch) => {
    setGroups(current => reviseGroup(current, id, patch));
    setSelected(current => current.filter(key => key !== id));
  };
  const confirm = () => {
    if (!selectedGroups.length) return;
    const ids = selectedGroups.map(group => group.id);
    setLastWritten(ids);
    setGroups(current => confirmGroups(current, ids));
    setSelected([]);
    setPhase('result');
    onWritten(selectedGroups.length, total);
  };
  return <main className="prototype wf05"><div className="workspace">
    {objectPanel}
    {agentPanel}
    <section className="reviewPane"><div className="paneHeading">{phase === 'result' ? '写入结果' : editing ? '精确编辑' : '产物与审核'}</div><div className="artifactHeader"><div><FileTextOutlined /><span><strong>前两日日程资源方案</strong><small>来源：当前业务协作会话</small><small>目标：本发团 / 执行安排 / 按日资源 / 04-02 至 04-03</small></span></div><Tag>{pending.length} 组待处理</Tag></div>
      <div className={`reviewContent ${editing ? 'editing' : 'reviewing'}`}>
      {editing ? <ResourceEdit key={editing} group={groups.find(group => group.id === editing)} onCancel={() => setEditing(null)} onSave={values => { updateGroup(editing, { ...values, evidence: `${groups.find(group => group.id === editing).evidence}；人工修正，见备注` }); setEditing(null); }} /> : phase === 'result' ? <><div className="reviewScroll"><section className="reviewSection"><h2>已写入 {lastWritten.length} 组资源</h2><p>本次资源成本 {money(groups.filter(group => lastWritten.includes(group.id)).reduce((sum, group) => sum + Math.round(group.amount * 100), 0) / 100)}。应付建议已保留，尚未生成应付记录。</p>{groups.filter(group => lastWritten.includes(group.id)).map(group => <div className="recordSection" key={group.id}><strong>{group.title}</strong><span>RES-{group.id.toUpperCase()} · 提案 v{group.version} · 已确认</span><span>{money(group.amount)} · {group.supplier}</span></div>)}<p>另有 {pending.length} 组待处理；已写入组不会再次提交。</p></section></div><div className="reviewFooter"><Button onClick={() => setPhase('review')}>继续处理资源</Button><Button onClick={() => setPhase('record')}>查看正式资源记录</Button><Button type="primary" onClick={()=>onContinuePayable(lastWritten)}>选择后续应付</Button></div></> : <>
        <div className="reviewScroll"><section className="reviewSection"><strong>待审核 {pending.length} 组 · 需处理 {pending.filter(blocked).length} 组</strong><p>按日期查看，勾选可独立提交的资源组。资源组内共同写入。</p></section>
        {['2026-04-02', '2026-04-03'].map(date => <section className="reviewSection" key={date}><div className="sectionTitle"><strong>{date} · {date.endsWith('02') ? '大阪抵达' : '京都游览'}</strong></div>{groups.filter(group => group.date === date).map(group => <article className="resourceGroup" key={group.id}>
          <div className="sectionTitle"><Checkbox disabled={group.written || blocked(group)} checked={selected.includes(group.id)} onChange={event => setSelected(current => event.target.checked ? [...current, group.id] : current.filter(id => id !== group.id))}>{group.title}</Checkbox><Tag color={group.written ? 'success' : blocked(group) ? 'warning' : 'blue'}>{group.written ? '已写入' : blocked(group) ? '待补充' : capacityWarning(group) ? '有执行提醒 · 可确认' : '可确认'}</Tag></div>
          <p>{group.segment} · {group.supplier} · v{group.version}</p><div className="resourceFacts"><span>材料对照：计划 32 人 / 可服务 {group.evidenceCapacity} 人</span><strong>{money(group.amount)}</strong></div>
          {resourceErrors(group).map(error=><p className="resourceWarning" key={error}>{error}</p>)}{capacityWarning(group) ? <p className="resourceWarning">材料显示缺少 {32-group.evidenceCapacity} 个座位。可补充确认材料；此执行提醒不阻止按已约定总价录入费用。</p> : null}<p>{group.notes}</p>
          <details><summary>查看依据与应付影响</summary><p>{group.evidence}</p><p>建议向 {group.supplier} 结算 {money(group.amount)}；本次仅写入资源，不提交应付。</p></details>
          {!group.written ? <Button type="link" onClick={() => setEditing(group.id)}>编辑资源</Button> : null}
        </article>)}</section>)}
        </div><div className="resourceSelection"><span>本次 {selectedGroups.length} 组 · {money(total)}</span><small>各资源组独立写入 · 应付另行提交</small></div><div className="reviewFooter"><Button onClick={() => { document.querySelector('[aria-label="与小团助手交流"]')?.focus(); }}>返回会话补充</Button><Button type="primary" disabled={!selectedGroups.length} onClick={confirm}>确认写入 {selectedGroups.length} 组资源</Button></div>
      </>}
      </div>
    </section>
  </div></main>;
}

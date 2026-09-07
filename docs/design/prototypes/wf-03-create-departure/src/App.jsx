import zhCN from "antd/locale/zh_CN";
import { useEffect, useMemo, useState } from "react";
import {
  App as AntApp,
  Avatar,
  Button,
  ConfigProvider,
  DatePicker,
  Form,
  Input,
  Radio,
  Select,
  Space,
  Spin,
  Tag,
  Timeline,
  Typography,
} from "antd";
import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  CommentOutlined,
  CompassOutlined,
  EditOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  FormOutlined,
  LinkOutlined,
  PaperClipOutlined,
  RobotOutlined,
  SendOutlined,
  TeamOutlined,
} from "@ant-design/icons";

import { BusinessPrototype } from "./BusinessPrototype.jsx";

const phases = [
  { key: "scope", label: "确认范围" },
  { key: "working", label: "Agent 执行" },
  { key: "question", label: "最小追问" },
  { key: "review", label: "产物待审核" },
  { key: "edit", label: "精确编辑" },
  { key: "paused", label: "待审核" },
  { key: "writing", label: "正式写入" },
  { key: "done", label: "结果承接" },
  { key: "record", label: "正式记录" },
];

const draftFields = [
  ["路线来源", "常用路线 · 关西赏樱 6 日"],
  ["团名", "2026-04-02 日本关西赏樱 6 日"],
  ["团期", "2026-04-02 至 2026-04-07"],
  ["发团类型", "独立团"],
  ["负责人", "张晓彤"],
  ["预计人数", "32 人"],
  ["联系电话", "138****2048"],
  ["司机", "关西交通"],
  ["导游", "王卓"],
];

const conversationCopy = {
  create: {
    user: "按这份行程单创建 4 月 2 日出发的关西团，负责人是我。",
    agent: "我会基于“关西赏樱 6 日”常用路线建立草稿，并核对团期、负责人和执行班组。",
    attachment: true,
  },
  crew: {
    user: "司机和导游继续沿用上次关西团的合作人员吗？",
    agent: "已核对可用状态：司机建议关西交通，导游建议王卓，并已同步到当前建团提案。",
    attachment: false,
  },
};

function PrecisionEdit({ onCancel, onSave }) {
  return (
    <div className="precisionEdit">
      <div className="precisionEditIntro"><div><strong>编辑全部字段</strong><small>正在编辑提案；保存后重新计算校验与影响。</small></div><Tag>自动保存</Tag></div>
      <Form layout="vertical" initialValues={{ route: "关西赏樱 6 日", name: "2026-04-02 日本关西赏樱 6 日", type: "independent", owner: "zhang", phone: "13800002048", driver: "fleet", guide: "wang" }}>
        <div className="formSectionTitle">路线与团期</div>
        <Form.Item label="常用路线" name="route"><Select options={[{ value: "关西赏樱 6 日", label: "关西赏樱 6 日" }]} /></Form.Item>
        <Form.Item label="团名" name="name"><Input /></Form.Item>
        <div className="formGrid"><Form.Item label="出团日期"><DatePicker placeholder="2026-04-02" /></Form.Item><Form.Item label="结束日期"><DatePicker placeholder="2026-04-07" /></Form.Item></div>
        <div className="formSectionTitle">基础信息</div>
        <div className="formGrid"><Form.Item label="发团类型" name="type"><Select options={[{ value: "independent", label: "独立团" }, { value: "combined", label: "拼团" }]} /></Form.Item><Form.Item label="负责人" name="owner"><Select options={[{ value: "zhang", label: "张晓彤" }]} /></Form.Item></div>
        <Form.Item label="联系电话" name="phone"><Input /></Form.Item>
        <div className="formSectionTitle">执行班组</div>
        <div className="formGrid"><Form.Item label="司机" name="driver"><Select options={[{ value: "fleet", label: "关西交通" }]} /></Form.Item><Form.Item label="导游" name="guide"><Select options={[{ value: "wang", label: "王卓" }]} /></Form.Item></div>
        <Form.Item label="备注"><Input.TextArea rows={3} /></Form.Item>
      </Form>
      <div className="precisionEditActions"><Button onClick={onCancel}>取消</Button><Button type="primary" onClick={onSave}>保存并返回审核</Button></div>
    </div>
  );
}

function ReviewPanel({ phase, version, edited, onPhase, onEdit, onSaveEdit }) {
  if (phase === "scope") {
    return (
      <div className="emptyReview">
        <CompassOutlined />
        <Typography.Title level={5}>先确认工作范围</Typography.Title>
        <Typography.Paragraph type="secondary">
          当前没有正式发团对象。Agent 将以这份“待创建发团草稿”为范围工作。
        </Typography.Paragraph>
        <Button type="primary" onClick={() => onPhase("working")}>确认范围并开始</Button>
      </div>
    );
  }

  if (phase === "working") {
    return (
      <div className="emptyReview">
        <Spin size="large" />
        <Typography.Title level={5}>正在形成建团提案</Typography.Title>
        <Typography.Paragraph type="secondary">右侧只在出现可审核产物时成为主工作面。</Typography.Paragraph>
      </div>
    );
  }

  if (phase === "question") {
    return (
      <div className="emptyReview attention">
        <CommentOutlined />
        <Typography.Title level={5}>等待会话补充</Typography.Title>
        <Typography.Paragraph type="secondary">可在中间会话继续补充，然后返回审核。</Typography.Paragraph>
      </div>
    );
  }

  if (phase === "edit") {
    return <PrecisionEdit onCancel={() => onPhase("review")} onSave={onSaveEdit} />;
  }

  if (phase === "paused") {
    return (
      <div className="emptyReview">
        <FileTextOutlined />
        <Typography.Title level={5}>审核已暂存</Typography.Title>
        <Typography.Paragraph type="secondary">提案仍处于待审核状态，离开不会确认、拒绝或取消。</Typography.Paragraph>
        <div className="officialRecord draftRecord">
          <span><small>待创建对象</small><strong>2026-04-02 日本关西赏樱 6 日</strong></span>
          <Tag color="warning">待审核</Tag>
          <dl><dt>草稿</dt><dd>v{version}</dd><dt>团期</dt><dd>04-02 至 04-07</dd><dt>负责人</dt><dd>张晓彤</dd></dl>
        </div>
        <Button type="primary" onClick={() => onPhase("review")}>继续审核</Button>
      </div>
    );
  }

  if (phase === "writing") {
    return (
      <div className="emptyReview">
        <Spin size="large" />
        <Typography.Title level={5}>正在创建正式发团</Typography.Title>
        <Typography.Paragraph type="secondary">重新校验权限、草稿版本、幂等键与业务规则。</Typography.Paragraph>
        <div className="writeChecks">
          <span>✓ 草稿版本 v{version}</span><span>✓ 创建权限</span><span>✓ 团期规则</span><span>写入中…</span>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="doneState">
        <CheckCircleFilled className="doneIcon" />
        <Typography.Title level={4}>发团已创建</Typography.Title>
        <Typography.Paragraph type="secondary">提案、证据与确认记录已保留在当前会话。</Typography.Paragraph>
        <div className="officialRecord">
          <span><small>正式业务对象</small><strong>2026-04-02 日本关西赏樱 6 日</strong></span>
          <Tag color="success">已创建</Tag>
          <dl><dt>团号</dt><dd>TX-260402-006</dd><dt>团期</dt><dd>04-02 至 04-07</dd><dt>负责人</dt><dd>张晓彤</dd></dl>
        </div>
        <Button type="primary" block onClick={() => onPhase("record")}>查看正式发团</Button>
      </div>
    );
  }

  return (
    <>
      <div className="reviewScroll">
        <div className="reviewProgress">
          <span className="complete"><b>✓</b> 沟通完成</span><i />
          <span className="active"><b>2</b> 审核草稿</span><i />
          <span><b>3</b> 创建正式发团</span>
        </div>

        <section className="reviewSection">
          <div className="sectionTitle"><strong>需要判断 1 项</strong><Tag color="warning">待判断</Tag></div>
          <div className="decisionRow">
            <div><small>执行班组</small><strong>司机和导游尚未锁定，是否先创建发团骨架？</strong><span>只写入建议人员，不生成资源预订或应付</span></div>
            <Radio.Group defaultValue="yes"><Radio value="yes">先创建</Radio><Radio value="later">返回补充</Radio></Radio.Group>
          </div>
        </section>

        <section className="reviewSection">
          <div className="sectionTitle"><strong>将写入草稿的内容 {edited ? <Tag color="success">已重新校验</Tag> : null}</strong><Button type="link" onClick={onEdit} icon={<EditOutlined />}>编辑全部字段</Button></div>
          <div className="fieldTable">
            {draftFields.map(([label, value], index) => (
              <div key={label}><span>{label}</span><strong>{value}</strong>{index === 2 ? <Tag color="blue">自动推算</Tag> : null}</div>
            ))}
          </div>
        </section>

        <section className="reviewSection evidence">
          <div className="sectionTitle"><strong>依据与影响</strong></div>
          <div className="evidenceGrid">
            <div><small>主要依据</small><strong><FileExcelOutlined /> 本会话提供的关西行程示例.txt</strong><span>路线、日期与执行人员</span></div>
            <div><small>创建后影响</small><strong>新增发团 1 个</strong><span>带出 6 日行程结构；资源金额均为 0</span></div>
          </div>
        </section>
      </div>

      <div className="reviewFooter">
        <Button size="large" onClick={() => onPhase("question")}><ArrowLeftOutlined /> 返回会话补充</Button>
        <Button size="large" type="primary" onClick={() => onPhase("writing")}>确认创建发团</Button>
      </div>
    </>
  );
}

export function Prototype({ objectPanel, agentPanel, onRecord, onCreated }) {
  const [phase, setPhaseState] = useState("scope");
  const setPhase = (next) => { if (next === "record") onRecord(); else setPhaseState(next); };
  useEffect(() => { if (phase === "done") onCreated(); }, [phase, onCreated]);
  const [activeConversation, setActiveConversation] = useState("create");
  const [input, setInput] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [version, setVersion] = useState(6);
  const [edited, setEdited] = useState(false);
  const { message } = AntApp.useApp();
  const phaseLabel = useMemo(() => phases.find((item) => item.key === phase)?.label, [phase]);
  const isDone = ["done", "record"].includes(phase);

  useEffect(() => {
    if (!["working", "writing"].includes(phase)) return undefined;
    const timer = window.setTimeout(() => setPhase(phase === "working" ? "review" : "done"), 1600);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const answerQuestion = (answer) => {
    message.success(`已补充：${answer}`);
    setPhase("review");
  };

  const sendMessage = () => {
    const value = input.trim();
    if (!value) return;
    setFollowUp(value);
    setInput("");
    if (phase === "question") setPhase("review");
    message.success(phase === "question" ? "补充已用于更新提案" : "消息已发送，Agent 将继续处理当前草稿");
  };

  const saveEdit = () => {
    setVersion((current) => current + 1);
    setEdited(true);
    setPhase("review");
    message.success("提案已更新并重新校验");
  };

  return (
    <main className="prototype">
      <header className="topbar">
        <div className="brandMark"><CompassOutlined /></div>
        <div className="objectTitle"><FileTextOutlined /><strong>{isDone ? "日本关西赏樱 6 日" : "待创建 · 日本关西赏樱 6 日"}</strong><Tag color={isDone ? "success" : "processing"}>{isDone ? "已创建" : "草稿"}</Tag></div>
        <div className="topMeta"><ClockCircleOutlined /> 当前时间：2026-09-04 14:32 <Avatar size={28}>张</Avatar><span>张晓彤</span></div>
      </header>

      {phase === "record" ? (
        <section className="recordPage">
          <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => setPhase("done")}>返回协作记录</Button>
          <div className="recordTitle"><div><Typography.Title level={3}>日本关西赏樱 6 日</Typography.Title><Typography.Text type="secondary">TX-260402-006 · 2026-04-02 至 2026-04-07</Typography.Text></div><Tag color="success">已创建</Tag></div>
          <nav className="recordTabs" aria-label="发团详情"><button className="active">概览</button><a href="/source-order" data-prototype-route>客源 · 关西示例团</a><a href="/resources" data-prototype-route>日程资源 · 关西示例团</a><button disabled title="财务原型尚未制作">财务（待设计）</button></nav>
          <div className="recordSummary">
            <div><small>负责人</small><strong>张晓彤</strong></div><div><small>预计人数</small><strong>32 人</strong></div><div><small>行程</small><strong>6 天</strong></div><div><small>待办</small><strong>补充资源预订</strong></div>
          </div>
          <section className="recordSection"><strong>创建结果</strong><p>已生成发团基础信息和 6 日行程结构；司机、导游为建议人员，尚未生成资源预订或应付。</p></section>
        </section>
      ) : <div className="workspace">
        {objectPanel}

        {agentPanel}

        <section className="reviewPane">
          <div className="paneHeading"><span>{isDone ? "创建结果" : phase === "edit" ? "精确编辑" : phase === "paused" ? "业务概览" : "产物与审核"}</span>{phase === "review" ? <Button type="link" size="small" onClick={() => setPhase("paused")}>退出审核</Button> : null}</div>
          <div className="artifactHeader">
            <div><FileTextOutlined /><span><strong>{phase === "done" ? "正式发团" : phase === "edit" ? `正在编辑提案 v${version}` : ["review", "paused", "writing"].includes(phase) ? `发团创建提案 v${version}` : `待创建发团草稿 v${version}`}</strong><small>来源：当前会话 · 目标：{phase === "done" ? "正式发团" : "创建新发团"}</small></span></div>
            {phase !== "done" ? <Tag color={phase === "review" ? "warning" : "default"}>{phaseLabel}</Tag> : null}
          </div>
          <div className={`reviewContent${phase === "edit" ? " editing" : phase === "review" ? " reviewing" : ""}`}><ReviewPanel phase={phase} version={version} edited={edited} onPhase={setPhase} onEdit={() => setPhase("edit")} onSaveEdit={saveEdit} /></div>
        </section>
      </div>}
    </main>
  );
}

export function App() {
  return <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: "#1464D9", borderRadius: 6, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" } }}><AntApp><BusinessPrototype /></AntApp></ConfigProvider>;
}

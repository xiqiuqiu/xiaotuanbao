import { materials, materialKinds } from './materials.mjs';
// Throwaway prototype: shared business facts and conversation, no real API calls.
import { useCallback, useRef, useState } from 'react';
import { initialReceivables, sourceAmounts, sourceErrors } from './source-review-model.mjs';
import { capacityWarning } from './resource-model.mjs';
import { businessFacts } from './business-model.mjs';
import { balance, available, canVerify } from './finance-model.mjs';
import { Button, Input, InputNumber, Tag, Table, Select, Drawer, Alert } from 'antd';
import { CommentOutlined, CompassOutlined, RobotOutlined } from '@ant-design/icons';
import { Prototype } from './App.jsx';
import { SourceOrderPrototype } from './SourceOrderPrototype.jsx';
import { ResourcePrototype, initialGroups } from './ResourcePrototype.jsx';

const money = n => `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const tabs = { overview:'概览信息', source:'客源管理', resources:'执行安排', income:'增收记录', receivables:'应收管理', payables:'应付管理', transactions:'收支流水', verifications:'核销记录' };
const directories = {
  partners: { title:'合作伙伴', object:'客户', rows:[['华东旅行社','组团社','客户结算 / 分拆收款']], help:'核对华东旅行社的客源单和未结清应收' },
  suppliers: { title:'供应商管理', object:'供应商', rows:[['大阪樱花酒店','住宿','大阪'],['关西交通','用车','大阪'],['京都和食','餐饮','京都']], help:'核对关西交通的资源安排和应付' },
  products: { title:'产品中心', object:'线路产品', rows:[['日本关西赏樱 6 日','6 日线路','大阪 / 京都 / 奈良']], help:'检查关西线路与本次发团的执行安排' },
  organization: { title:'组织管理', object:'组织', rows:[['演示旅行社','旅行社','启用']], help:'说明组织、员工与业务权限的关系' },
  employees: { title:'员工管理', object:'员工', rows:[['张晓彤','计调','发团与资源安排'],['李会计','财务','账款、流水与核销']], help:'解释计调和财务在本次协作中的职责' },
};
const names = { list:'发团管理', home:'工作台', ...tabs, ...Object.fromEntries(Object.entries(directories).map(([k,v])=>[k,v.title])) };
const categories = {all:'本团全部协作',create:'发团信息',source:'客源管理',resources:'执行安排',finance:'财务'};
const reviewNames = { create:'建团提案', source:'客源单与游客提案', resources:'资源安排提案', finance:'财务操作提案' };
const columns = labels => labels.map(([key,title])=>({key,dataIndex:key,title}));
const initialSource = {partner:'华东旅行社',adults:8,children:2,adultPrice:6800,childPrice:4200,adjustments:[],adjustment:0,discountType:'lump',discount:2000,collectionMode:'partner',deposit:null,balance:null,settlementNotes:'',notes:''};

export function BusinessPrototype() {
  const [page,setPage] = useState('list');
  const [globalFinance,setGlobalFinance] = useState(false);
  const [review,setReview] = useState(null);
  const [category,setCategory] = useState('all');
  const [created,setCreated] = useState(false);
  const [source,setSource] = useState(null);
  const [groups,setGroups] = useState(initialGroups);
  const [agentOpen,setAgentOpen] = useState(false);

  const [contextEnabled,setContextEnabled] = useState(true);
  const [threads,setThreads] = useState([{id:'list-1',title:'发团管理协作',objects:['list']}]);
  const [activeThreadId,setActiveThreadId] = useState('list-1');
  const activeThreadRef = useRef(activeThreadId);
  activeThreadRef.current = activeThreadId;
  const [messageStore,setMessageStore] = useState({});
  const [inputStore,setInputStore] = useState({});
  const messages = messageStore[activeThreadId] || [];
  const input = inputStore[activeThreadId] || '';
  const setInput = value => setInputStore(current=>({...current,[activeThreadId]:value}));
  const setMessages = useCallback(update=>{const id=activeThreadRef.current;setMessageStore(current=>({...current,[id]:update(current[id]||[])}));},[]);
  const [reviewOrigins,setReviewOrigins] = useState({});
  const reviewOriginsRef=useRef(reviewOrigins);reviewOriginsRef.current=reviewOrigins;
  const [materialChoice,setMaterialChoice] = useState(null);
  const [pending,setPending] = useState([]);
  const [manual,setManual] = useState(null);
  const [draft,setDraft] = useState({});
  const [manualRows,setManualRows] = useState([]);
  const [filter,setFilter] = useState('');
  const [day,setDay] = useState('2026-04-02');
  const [level,setLevel] = useState('day');
  const [incomes,setIncomes] = useState([]);
  const [schedules,setSchedules] = useState([]);
  const [transactions,setTransactions] = useState([]);
  const [verifications,setVerifications] = useState([]);
  const [proposal,setProposal] = useState(null);
  const [payableChoices,setPayableChoices] = useState(null);
  const [payableIds,setPayableIds] = useState([]);
  const departureStatus = '编辑中';
  const [notice,setNotice] = useState('');
  const publish=useCallback((id,text)=>setMessageStore(current=>({...current,[id]:[...(current[id]||[]),{role:'agent',text}]})),[]);
  const addMessage = useCallback(text=>publish(activeThreadRef.current,text),[publish]);
  const onCreated = useCallback(()=>{const owner=reviewOriginsRef.current.create?.threadId||activeThreadRef.current;setCreated(true);setThreads(current=>current.map(t=>t.id===owner?{...t,objects:[...new Set([...t.objects,'departure'])]}:t));setPending(current=>current.filter(x=>x!=='create'));publish(owner,'发团已创建。查看概览后，可继续整理客源与执行安排。');},[publish]);
  const onConfirmed = useCallback(values=>{setSource(values);setPending(current=>current.filter(x=>x!=='source'));publish(reviewOriginsRef.current.source?.threadId||activeThreadRef.current,'客源单与游客已写入客源管理。尚未提交应收。');},[publish]);
  const {resources:resourceRows,costs,receivable,guestCount} = businessFacts(source,groups,manualRows);
  const incomeTotal = incomes.reduce((sum,row)=>sum+Math.round(row.amount*100),0)/100;
  const isDetail = !!tabs[page] && !globalFinance;
  const scope = contextEnabled ? (isDetail&&created?`关西赏樱 6 日 / ${tabs[page]}${page==='resources'?` / ${level==='day'?day:'发团级资源'}`:''}`:names[page]) : '未附带页面上下文';
  const anchorFor = (next,global=false)=>tabs[next]&&!global?'departure':global?`finance-${next}`:next;
  const anchor = anchorFor(page,globalFinance);
  const anchorName = key=>key==='departure'?'日本关西赏樱 6 日':key.startsWith('finance-')?`财务管理 / ${tabs[key.slice(8)]}`:names[key];
  const currentThread=threads.find(t=>t.id===activeThreadId);
  const relatedThreads=threads.filter(t=>t.objects.includes(anchor));
  const startThread = (object=anchor,open=true)=>{
    const id=`thread-${Date.now()}-${threads.length}`;
    setThreads(current=>[...current,{id,title:`${anchorName(object)} · 新协作`,objects:[object]}]);setActiveThreadId(id);setReview(review?'items':null);setCategory('all');if(open)setAgentOpen(true);return id;
  };
  const go = (next,global=false,related=false)=>{
    const target=anchorFor(next,global);
    if(related){setThreads(current=>current.map(t=>t.id===activeThreadId?{...t,objects:[...new Set([...t.objects,target])]}:t));}
    else if(!currentThread?.objects.includes(target)&&next!=='home'){
      const thread=threads.filter(t=>t.objects.includes(target)).at(-1);
      if(thread)setActiveThreadId(thread.id);else startThread(target,false);
    }
    setPage(next);setGlobalFinance(global);setReview(null);setCategory('all');setManual(null);setNotice('');setContextEnabled(true);
    if(next==='home')setAgentOpen(false);
  };
  const outstanding = pending.filter(key=>key!=='resources'||groups.some(g=>!g.written));
  const localPending=outstanding.filter(key=>reviewOrigins[key]?.threadId===activeThreadId);
  const objectPending=outstanding.filter(key=>threads.find(t=>t.id===reviewOrigins[key]?.threadId)?.objects.includes(anchor));
  const openReview = key=>{
    const origin=reviewOrigins[key];
    if(origin){setActiveThreadId(origin.threadId);setPage(origin.global?origin.page:({create:'overview',source:'source',resources:'resources',finance:'payables'}[key]||origin.page));setGlobalFinance(origin.global);setDay(origin.day);setLevel(origin.level);}
    setReview(key);setCategory(key);setAgentOpen(true);setContextEnabled(true);
  };
  const requestReview = key=>{
    if(pending.includes(key)&&reviewOrigins[key]?.threadId!==activeThreadId){addMessage('本业务已有相关提案待审核，可从本业务待处理或工作台返回来源协作继续处理。');setAgentOpen(true);return false;}
    setPending(current=>current.includes(key)?current:[...current,key]);
    setReviewOrigins(current=>({...current,[key]:{threadId:activeThreadId,page,global:globalFinance,day,level}}));setAgentOpen(true);return true;
  };
  const ask = text=>{
    if(!text.trim()) return;
    setThreads(current=>current.map(t=>t.id===activeThreadId&&!(messageStore[activeThreadId]?.length)?{...t,title:text.trim()===materials.combined.text?'补齐关西团名单与资源':text.slice(0,24)}:t));
    setMessages(current=>[...current,{role:'user',text,scope}]);setInput('');setMaterialChoice(null);setAgentOpen(true);
    if(!contextEnabled){addMessage('当前未附带页面上下文。请先重新附带页面，或明确提供目标团号及业务记录。');return;}
    if(/权限|职责|组织/.test(text)){addMessage('计调整理客源、资源并提交账款；财务管理流水与核销。Agent 的可执行动作应沿用当前员工权限，不能因跨业务协作扩大权限。');return;}
    const kinds=materialKinds(text);
    if(kinds.includes('create')){
      if(created){addMessage('当前演示团已存在，请核对要新增还是修改；本轮不重复建团。');return;}
      if(requestReview('create'))addMessage('已从你提供的行程示例提取团期、人数和行程。请打开建团审核；尚未写入。');return;
    }
    if(!created){addMessage('请提供团名、出发/返回日期、人数及行程内容，或先选择已有发团。仅说明要建团还不能生成提案。');return;}
    if(kinds.includes('supplement')){if(!pending.includes('resources')){addMessage('已收到车队补充信息，请先提供原资源材料，以便核对修改对象。');return;}if(reviewOrigins.resources?.threadId!==activeThreadId){addMessage('请回到资源提案的来源协作提供补充材料，以免修改错误的提案。');return;}supplement();return;}
    if(kinds.includes('source')){
      if(source){addMessage('当前已存在客源单。请指出本次材料需要补充或修改哪些内容；不会重复新增。');}
      else if(requestReview('source'))addMessage('已从本条报名材料提取客户、10位游客和价格，计算结算金额60,800元。仅姓名必填；电话、性别和备注可选。请核对本次录入名单和完整报价。');
    }
    if(kinds.includes('resources')){
      if(requestReview('resources'))addMessage('已从本条确认材料提取酒店、接送、团餐三组记录。对照已有计划32人，28座接送缺4座，展示执行提醒但不阻止合法费用录入。三条资源按约定总价独立审核。');
    }else if(kinds.includes('source')){return;
    }else if(!/^(检查|查询|解释|核对)/.test(text)||/录入|新增|修改|补录|安排|报名|上传|材料/.test(text)){
      addMessage('已收到你的描述。请补充需要录入或修改的业务内容、对象、日期、约定总价及备注；不确定的信息会保留待核实。本原型仅对输入区提供的完整示例模拟识别，自定义文本及文件不会套用示例生成提案。');
    }else{
      addMessage(`当前示例团：${guestCount} 人，资源 ${resourceRows.length} 条，成本 ${money(costs)}，结算应收 ${money(receivable)}，公司增收 ${money(incomeTotal)}。已提交应收 ${schedules.filter(s=>s.direction==='收入').length} 笔、应付 ${schedules.filter(s=>s.direction==='支出').length} 笔；流水 ${transactions.length} 笔，核销 ${verifications.length} 笔。${page==='suppliers'?'关西交通对应机场接送资源，可从关联记录返回执行安排。':''}这里只查询已确认业务记录，待审核材料不计入。`);
    }
  };
  const supplement = ()=>{
    if(groups.find(g=>g.id==='bus').written) return;
    setGroups(current=>current.map(g=>g.id==='bus'?{...g,title:'机场接送 · 35 座巴士',evidenceCapacity:35,amount:2800,version:g.version+1,evidence:'车队补充确认单：35 座 / ¥2,800',notes:'35 个可用乘客座位，满足计划 32 人'}:g));
    addMessage('补充确认单已更新接送组：35 座、¥2,800。其他组和已写入记录保持原状。');
  };
  const prepareFinance = (kind,rows)=>{
    if(proposal&&!proposal.done&&proposal.kind!==kind){setNotice('已有财务提案待审核，请先完成该提案；原提案已保留。');setAgentOpen(true);return;}
    if(!requestReview('finance'))return;
    setProposal({kind,rows,done:false,snapshot:JSON.stringify(kind==='提交应收'?source:kind==='提交应付'?resourceRows:null)});
    addMessage(`${kind}提案已准备。请核对业务来源、往来对象和金额；打开审核后确认。`);
  };
  const submitSource = ()=>{
    if(!source||schedules.some(s=>s.origin==='source')) return;
    const rows=initialReceivables(source,receivable);
    if(!rows.length){setNotice('当前客源没有适用的正金额初始应收，无需生成账款。');return;}
    prepareFinance('提交应收',rows);
  };
  const submitResources = (ids)=>{
    const rows=resourceRows.filter(r=>(!Array.isArray(ids)||ids.includes(r.id))&&!schedules.some(s=>s.origin===r.id));
    setPayableChoices(rows);setPayableIds([]);
  };
  const matched = schedules.flatMap(s=>transactions.filter(t=>canVerify(s,t,verifications,Math.min(balance(s,verifications),available(t,verifications)))).map(t=>({id:`V-${s.id}-${t.id}`,scheduleId:s.id,transactionId:t.id,title:s.title,partner:s.partner,direction:s.direction,amount:Math.min(balance(s,verifications),available(t,verifications))})));
  const confirmFinance = ()=>{
    if(!proposal||proposal.done) return;
    if(proposal.kind!=='核销'&&proposal.snapshot!==JSON.stringify(proposal.kind==='提交应收'?source:resourceRows)){setNotice('业务来源已修改，请返回业务页面重新生成提案。');return;}
    if(proposal.kind==='核销'){
      const row=proposal.rows[0];
      if(!canVerify(schedules.find(s=>s.id===row.scheduleId),transactions.find(t=>t.id===row.transactionId),verifications,row.amount)){setNotice('可核销余额已变化，请重新生成提案。');return;}
      setVerifications(current=>[...current,row]);
    }else setSchedules(current=>[...current,...proposal.rows.filter(r=>!current.some(s=>s.id===r.id))]);
    setProposal(current=>({...current,done:true}));setPending(current=>current.filter(k=>k!=='finance'));addMessage(`${proposal.kind}已确认，业务记录已更新。${proposal.kind==='核销'?'流水余额和账款进度同步更新。':'尚未登记收付款，也未核销。'}`);
  };
  const openManual = (kind,values)=>{setDraft(values);setManual(kind);};
  const saveManual = ()=>{
    if(manual==='resource') setManualRows(current=>[...current,{...draft,id:`manual-${current.length}`,amount:Number(draft.amount)}]);
    if(manual==='source'){if(sourceErrors(draft).length){setNotice(sourceErrors(draft).join('；'));return;}setSource({...draft,...sourceAmounts(draft)});}
    if(manual==='income')setIncomes(current=>[...current,{...draft,id:`income-${current.length}`}]);
    if(manual==='transaction')setTransactions(current=>[...current,{...draft,id:`TX-${current.length+1}`}]);
    if(manual==='create'){setCreated(true);go('overview');}
    setManual(null);setNotice('已保存到本次演示业务记录。');
  };
  const localItems=Object.keys(reviewOrigins).filter(key=>reviewOrigins[key].threadId===activeThreadId);
  const visibleItems=localItems.filter(key=>category==='all'||key===category);
  const itemState=key=>!outstanding.includes(key)?'已确认':key==='resources'&&groups.some(g=>!g.written&&capacityWarning(g))?'有执行提醒 · 可审核':'待审核';
  const showItems=()=>{setReview('items');setAgentOpen(true);};
  const selectThread=id=>{setActiveThreadId(id);setReview(review?'items':null);setAgentOpen(true);};
  const history=<section className="objectHistory"><strong>相关协作记录</strong>{relatedThreads.filter(t=>category==='all'||Object.entries(reviewOrigins).some(([key,origin])=>key===category&&origin.threadId===t.id)||t.id===activeThreadId).map(t=><Button type={activeThreadId===t.id?'link':'text'} key={t.id} onClick={()=>selectThread(t.id)}>{t.title}</Button>)}<Button size="small" onClick={()=>startThread()}>新建协作</Button></section>;
  const businessNav=<><nav className="scopeNav" aria-label="协作业务分类">{Object.entries(categories).map(([key,label])=><button key={key} className={category===key?'active':''} onClick={()=>{setCategory(key);showItems();}}>{label}</button>)}</nav>{history}</>;
  const objectPanel=<aside className="scopePane sharedObjectPane"><div className="paneHeading">业务对象</div><div className="draftCard"><div className="draftTitle"><strong>{created?'日本关西赏樱 6 日':'待创建发团'}</strong></div><dl><dt>发团日期</dt><dd>{created||reviewOrigins.create?'04-02 至 04-07':'待提供'}</dd><dt>计划人数</dt><dd>{created||reviewOrigins.create?'32 人':'待提供'}</dd><dt>负责人</dt><dd>{created||reviewOrigins.create?'张晓彤':'待提供'}</dd></dl></div>{businessNav}</aside>;
  const agentPanel=<section className="collaborationPane sharedAgent"><div className="paneHeading"><span><RobotOutlined/> 小团助手</span><div><Button type="text" onClick={()=>{setCategory("all");showItems();}}>{review?"本次事项":"展开协作"}</Button>{!review&&<Button type="text" onClick={()=>{setAgentOpen(false);}}>收起</Button>}</div></div><div className="agentContext"><Select aria-label="当前业务协作记录" value={activeThreadId} onChange={selectThread} options={relatedThreads.map(t=>({value:t.id,label:t.title}))} style={{width:"100%",marginBottom:8}}/><small>关联范围：{currentThread?.objects.map(anchorName).join("、")}</small><Tag closable={contextEnabled} onClose={()=>setContextEnabled(false)}>{review&&created?'日本关西赏樱 6 日':scope}</Tag>{!contextEnabled&&<Button type="link" size="small" onClick={()=>setContextEnabled(true)}>附带当前页面</Button>}</div><div className="businessMessages">{messages.length===0?<><h3>今天有什么需要我协助？</h3><p>请先描述需求、粘贴信息或提供材料。我会识别相关业务，核实不确定信息，再形成审核包。</p><Button onClick={()=>ask(directories[page]?.help||(created?'检查这个团有哪些待处理事项':'根据行程单创建关西 6 日团'))}>{directories[page]?'核对关联业务':created?'检查已有记录':'了解建团需要的信息'}</Button></>:messages.map((m,i)=><div className={`businessMessage ${m.role}`} key={i}><small>{m.role==='user'?'张晓彤':'小团助手'}{m.scope?` · ${m.scope}`:''}</small><p>{m.text}</p></div>)}{localPending.map(key=><div className="pendingArtifact" key={key}><strong>{reviewNames[key]}</strong><Tag color="warning">待审核</Tag><Button onClick={()=>openReview(key)}>打开审核</Button></div>)}</div><div className="businessComposer"><details><summary>提供示例材料</summary><p>选择后先查看内容，再发送。仅用于模拟识别流程。</p>{Object.entries(materials).map(([key,m])=><Button size="small" key={key} onClick={()=>{setInput(m.text);setMaterialChoice(key);}}>{m.name}</Button>)}</details><label>上传材料<input type="file" accept=".txt,.csv,.pdf,.png,.jpg,.jpeg,.xlsx" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setMaterialChoice(null);if(/\.(txt|csv)$/i.test(file.name)&&file.size<200000){setInput(await file.text());}else{setMessages(current=>[...current,{role:'user',text:`提供文件：${file.name}`,scope}]);addMessage('文件已选择；此原型未接入OCR或文档解析，请粘贴其中的文字，或使用可查看完整内容的示例材料。尚未形成审核包。');}e.target.value='';}}/></label><Input.TextArea aria-label="与小团助手交流" value={input} onChange={e=>setInput(e.target.value)} rows={materialChoice?5:2} placeholder="描述需求、粘贴业务信息，或提供材料…"/><Button onClick={()=>ask(input)} disabled={!input.trim()}>发送</Button></div></section>;
  const financeTable = <Table size="small" rowKey="id" pagination={false} scroll={{x:650}} dataSource={schedules.filter(s=>s.direction===(page==='receivables'?'收入':'支出'))} columns={[...columns([['id','单号'],['title','来源 / 费用项目'],['partner',page==='receivables'?'收款对象':'付款对象']]),{title:'金额',render:(_,s)=>money(s.amount)},{title:'未结清',render:(_,s)=>money(balance(s,verifications))},{title:'操作',render:(_,s)=><Button type="link" onClick={()=>openManual('transaction',{title:`${s.title}收付款`,partner:s.partner,direction:s.direction,amount:balance(s,verifications)})} disabled={balance(s,verifications)<=0}>登记{s.direction==='收入'?'收款':'付款'}</Button>}]}/>;
  const title=directories[page]?.title||(page==='list'?'发团管理':page==='home'?'工作台':globalFinance?names[page]:'日本关西赏樱 6 日');
  return <main className={`businessApp ${review?'inReview':''}`}>
    <aside className="businessSidebar"><strong><CompassOutlined/> 小团宝</strong><nav aria-label="业务导航">{[['home','工作台'],['list','发团管理'],['partners','合作伙伴'],['suppliers','供应商管理'],['products','产品中心']].map(([key,label])=><button key={key} className={page===key||key==='list'&&isDetail?'active':''} onClick={()=>go(key)}>{label}</button>)}<small>财务管理</small>{['receivables','payables','transactions','verifications'].map(key=><button key={key} className={globalFinance&&page===key?'active':''} onClick={()=>go(key,true)}>{key==='verifications'?'核销管理':tabs[key]}</button>)}<small>系统管理</small>{['organization','employees'].map(key=><button key={key} onClick={()=>go(key)}>{names[key]}</button>)}</nav><small>交互原型 · 示例数据<br/>刷新后重置，不连接真实业务</small></aside>
    <div className="businessMain"><header className="businessHeader"><span>{isDetail?'发团管理 / ':globalFinance?'财务管理 / ':''}{names[page]}{review?` / ${review==='items'?'协作事项':reviewNames[review]}`:''}</span>{page==='home'?null:review?<div className="workspaceActions">{review!=="items"&&<Button onClick={()=>{setCategory("all");showItems();}}>返回本次事项</Button>}<Button onClick={()=>setReview(null)}>返回业务页面</Button></div>:<Button icon={<CommentOutlined/>} onClick={()=>{setAgentOpen(!agentOpen);}}>{agentOpen?'收起助手':'小团助手'}</Button>}</header>
    <div hidden={!review} className="embeddedReview">
      {review==='items'&&<div className="prototype"><div className="workspace">
        {objectPanel}
        {agentPanel}
        <section className="reviewPane"><div className="paneHeading">本次协作事项</div><div className="reviewContent reviewing"><div className="reviewScroll"><section className="reviewSection">
          <h2>{currentThread?.title}</h2><p>{categories[category]} · 共 {localItems.length} 项，已确认 {localItems.filter(k=>!outstanding.includes(k)).length} 项</p>
          {category!=='all'&&localItems.length>visibleItems.length&&<Button type="link" onClick={()=>setCategory('all')}>查看其他业务的 {localItems.length-visibleItems.length} 项</Button>}
          {!visibleItems.length&&<p>当前范围暂无事项。请在会话中提供需求和材料；有疑问先补充核实，形成提案后再审核。</p>}
          {visibleItems.map(key=><section className="collaborationItem" key={key}><small>{categories[key]}</small><h3>{reviewNames[key]}</h3><span className="itemStatus">{itemState(key)}</span>
            {key==='resources'&&<p>已确认 {groups.filter(g=>g.written).length} / {groups.length} 组。各组独立审核；接送座位不足提示执行风险，不阻止费用录入。</p>}
            {key==='source'&&outstanding.includes(key)&&<p>10 位名单候选；可修订姓名、电话、性别与备注，选择本次录入名单。</p>}
            {key==='finance'&&<p>增收、应收应付、收支流水和核销分别确认；账款不代表资金已收付。</p>}
            <Button onClick={()=>openReview(key)}>{outstanding.includes(key)?'查看与审核':'查看结果'}</Button>
            {key==='resources'&&outstanding.includes(key)&&<Button type="link" onClick={()=>{setInput(materials.supplement.text);setMaterialChoice('supplement');}}>填写补充材料示例</Button>}
          </section>)}
          {category==='finance'&&!localItems.includes('finance')&&<p>财务事项会在提供明确指令与依据后形成。资源录入不会自动提交应付。</p>}
        </section></div><div className="reviewFooter"><Button onClick={()=>setReview(null)}>收起为侧边栏</Button><span>沟通与已确认结果保留在当前协作</span></div></div></section>
      </div></div>}
      <div hidden={review!=='create'}><Prototype objectPanel={objectPanel} agentPanel={agentPanel} onCreated={onCreated} onRecord={()=>go('overview')}/></div>
      <div hidden={review!=='source'}><SourceOrderPrototype objectPanel={objectPanel} agentPanel={agentPanel} onConfirmed={onConfirmed} onSubmitReceivable={submitSource} receivableSubmitted={schedules.some(s=>s.origin==='source')} onRecord={()=>go('source')}/></div>
      <div hidden={review!=='resources'}><ResourcePrototype objectPanel={objectPanel} agentPanel={agentPanel} groups={groups} setGroups={setGroups} onWritten={(count,total)=>addMessage(`已写入 ${count} 组资源，成本 ${money(total)}，尚未提交应付。`)} onContinuePayable={submitResources} onRecord={()=>go('resources')}/></div>
      {review==='finance'&&proposal&&<div className="prototype"><div className="workspace">{objectPanel}{agentPanel}<section className="reviewPane"><div className="paneHeading">{proposal.done?'操作结果':'产物与审核'}</div><div className="reviewContent reviewing"><div className="reviewScroll"><section className="reviewSection"><h2>{proposal.kind}{proposal.done?'已完成':'审核'}</h2><p>{proposal.kind==='核销'?'将已登记流水分配到具体账款；不新增流水，也不改变发团状态。':'生成对应收付款节点；不代表资金已收付。同一客源的适用节点整体确认，不单独取消某笔；应付按已选资源独立处理。'}</p>{proposal.kind==='提交应收'&&source?.collectionMode==='split'&&<Alert type="warning" showIcon title="按客源单约定的游客代收金额与客户补款拆分，请逐项核对往来对象。"/>}{proposal.rows.map(row=><section className="recordSection" key={row.id}><strong>{row.title}</strong><span>{row.partner} · {row.direction}</span><strong>{money(row.amount)}</strong><small>来源：{row.origin==='source'?`${source?.partner}客源单`:row.origin?resourceRows.find(r=>r.id===row.origin)?.date:`账款 ${row.scheduleId} / 流水 ${row.transactionId}`}</small></section>)}{proposal.done&&<Alert type="success" title="本次演示记录已更新，可返回业务页面查看。"/>}{notice&&<Alert type="warning" title={notice}/>}</section></div><div className="reviewFooter"><Button onClick={()=>setReview(null)}>{proposal.done?'返回业务页面':'暂不处理'}</Button>{!proposal.done&&<Button type="primary" disabled={!proposal.rows.length} onClick={confirmFinance}>确认{proposal.kind}</Button>}</div></div></section></div></div>}
    </div>
    <div hidden={!!review} className={`businessBody ${agentOpen?'withAgent':''}`}><section className="businessContent">
      <div className="businessTitle"><div><h1>{title}</h1><p>{isDetail&&created?'TX-260402-006 · 2026-04-02 至 04-07 · 计划 32 人 · 负责人 张晓彤':globalFinance?'跨发团查看财务记录 · 当前演示范围：关西赏樱 6 日':'管理业务记录，随时请助手协作'}</p></div>{page==='list'?<Button type="primary" disabled={created} onClick={()=>openManual('create',{})}>新建发团</Button>:page==='home'?null:<Button onClick={()=>ask(directories[page]?.help||'检查这个团有哪些待处理事项')}>请助手检查</Button>}</div>
      {notice&&<Alert type="success" title={notice} closable={{onClose:()=>setNotice('')}}/>}
      {isDetail&&created&&<><div className="businessActions"><Button onClick={()=>go('list')}>返回发团列表</Button><Tag color="blue">发团 · {departureStatus}</Tag><Tag>行程 · 已结束</Tag></div><nav className="businessTabs" aria-label="发团分区">{Object.entries(tabs).map(([key,label])=><button key={key} className={page===key?'active':''} onClick={()=>go(key)}>{label}</button>)}</nav></>}
      {page==='list'&&<><Input aria-label="搜索发团" placeholder="搜索团名或团号" value={filter} onChange={e=>setFilter(e.target.value)}/>{created?<Table rowKey="id" pagination={false} scroll={{x:750}} dataSource={!filter||'日本关西赏樱 6 日 TX-260402-006'.includes(filter)?[{id:'TX-260402-006'}]:[]} columns={[{title:'团号 / 名称',render:()=> <Button type="link" onClick={()=>go('overview')}>TX-260402-006 · 日本关西赏樱 6 日</Button>},{title:'团期',render:()=> '04-02 至 04-07'},{title:'人数',render:()=>guestCount},{title:'完成情况',render:()=>`${source?'客源已录入':'待补客源'} · ${resourceRows.length} 条资源`},{title:'发团状态',render:()=>departureStatus}]}/>:<div className="businessEmpty"><h2>选择一个开始方式</h2><p>从已有发团查看 Agent 如何协助日常业务，或体验从行程建团。</p><div className="businessActions"><Button onClick={()=>{setCreated(true);go('overview');}}>打开已有发团示例</Button><Button onClick={()=>setAgentOpen(true)}>与助手沟通建团</Button></div></div>}</>}
      {page==='home'&&<><section className="recordSection"><strong>协作待办</strong><p>待审核 {outstanding.length} 项。点击待办可回到业务对象、来源协作和具体审核内容。</p>{!outstanding.length&&<p>暂无待确认事项。从发团、合作伙伴或财务页面发起协作。</p>}</section><section className="recordSection"><strong>业务待办</strong><p>客源录入与资源安排完成后，在对应业务页面提交账款。</p><div className="businessActions"><Button onClick={()=>go(created?'source':'list')}>待提交应收 · {source&&!schedules.some(s=>s.origin==='source')?1:0}</Button><Button onClick={()=>go(created?'resources':'list')}>待提交应付 · {resourceRows.filter(r=>!schedules.some(s=>s.origin===r.id)).length}</Button></div></section><Button onClick={()=>go('list')}>进入发团管理</Button></>}
      {directories[page]&&<><Table rowKey="name" pagination={false} dataSource={directories[page].rows.map(([name,kind,note])=>({name,kind,note}))} columns={columns([['name',directories[page].object],['kind','类型 / 职责'],['note','业务信息']])}/><section className="recordSection"><strong>关联业务</strong><p>{page==='organization'||page==='employees'?'助手沿用员工权限。此处展示组织与岗位范围，原型不修改账号权限。':'目录资料供发团录入引用；进入关联业务后，仍在同一会话中继续处理。'}</p>{!['organization','employees'].includes(page)&&<Button onClick={()=>go(created?(page==='partners'?'source':page==='products'?'overview':'resources'):'list',false,true)}>查看关联{page==='partners'?'客源单':page==='products'?'发团':'资源'}</Button>}</section></>}
      {isDetail&&!created&&<div className="businessEmpty">请先选择或创建演示发团。<Button onClick={()=>go('list')}>返回发团管理</Button></div>}
      {created&&page==='overview'&&<><div className="recordSummary"><div><small>结算应收</small><strong>{money(receivable)}</strong></div><div><small>成本合计</small><strong>{money(costs)}</strong></div><div><small>当前毛利（含增收）</small><strong>{money(receivable+incomeTotal-costs)}</strong></div></div><section className="recordSection"><strong>待办提醒</strong><div className="businessActions"><Button onClick={()=>go('source')}>{source?'查看客源与游客':'客名单待完善'}</Button><Button onClick={()=>go('resources')}>完善行程与资源</Button><Button onClick={()=>go('receivables')}>查看应收进度</Button></div><p>计划 32 人，已收客 {guestCount} 人，已录游客 {source?.visitors?.length||0} 位。审核中的材料不计入经营数据。</p></section><section className="recordSection"><strong>已提交账款进度</strong>{['收入','支出'].map(direction=><p key={direction}>{direction==='收入'?'应收':'应付'} {money(schedules.filter(s=>s.direction===direction).reduce((sum,s)=>sum+s.amount,0))} · 未结清 {money(schedules.filter(s=>s.direction===direction).reduce((sum,s)=>sum+balance(s,verifications),0))}</p>)}</section></>}
      {created&&page==='source'&&<><div className="businessActions"><Button type="primary" onClick={()=>openManual('source',source||initialSource)} disabled={schedules.some(s=>s.origin==='source')}>{source?'编辑客源单':'添加客源单'}</Button><Button disabled={!source||schedules.some(s=>s.origin==='source')} onClick={submitSource}>提交应收</Button></div><Table rowKey="partner" pagination={false} scroll={{x:700}} dataSource={source?[{partner:source.partner}]:[]} columns={[...columns([['partner','客户']]),{title:'人数 / 客名单',render:()=> <><span>{guestCount} 人 · 已录 {source.visitors?.length||0} 位</span><Button type="link" onClick={()=>openManual('visitors',{})}>查看游客</Button></>},{title:'原始应收',render:()=>money(source.adults*source.adultPrice+source.children*source.childPrice)},{title:'优惠',render:()=>money(source.discount)},{title:'结算金额',render:()=>money(receivable)},{title:'收款方式',render:()=>({partner:'客户结算',split:'分拆收款',guest:'全部我方代收'}[source.collectionMode])},{title:'应收状态',render:()=>schedules.some(s=>s.origin==='source')?'已提交':'未提交'}]}/>{source&&<p>已提交账款的客源单在本次演示中只读；金额调整需另行核对财务影响。</p>}</>}
      {created&&page==='resources'&&<><div className="businessActions"><Button type={level==='day'?'primary':'default'} onClick={()=>setLevel('day')}>按日资源</Button><Button type={level==='departure'?'primary':'default'} onClick={()=>setLevel('departure')}>发团级资源</Button></div>{level==='day'&&<nav className="businessDays" aria-label="行程日期">{Array.from({length:6},(_,i)=>`2026-04-0${i+2}`).map((date,i)=><button className={day===date?'active':''} key={date} onClick={()=>setDay(date)}><strong>D{i+1} · {date.slice(5)}</strong><small>{['大阪抵达','京都游览','奈良游览','大阪自由行','大阪游览','返程'][i]}</small></button>)}</nav>}<div className="businessActions"><Button type="primary" onClick={()=>openManual('resource',{title:'临时接送',kind:'用车',supplier:'关西交通',date:level==='day'?day:'全程',amount:600})}>添加资源</Button><Button disabled={!resourceRows.some(r=>!schedules.some(s=>s.origin===r.id))} onClick={submitResources}>提交本团资源应付</Button></div><Table rowKey="id" pagination={false} scroll={{x:600}} dataSource={resourceRows.filter(r=>level==='departure'?r.date==='全程':r.date===day)} columns={[...columns([['title','资源名称'],['supplier','供应商']]),{title:'金额',render:(_,r)=>money(r.amount)},{title:'应付状态',render:(_,r)=>schedules.some(s=>s.origin===r.id)?'已提交':'未提交'}]}/></>}
      {created&&page==='income'&&<><div className="businessActions"><Button type="primary" onClick={()=>openManual('income',{title:'自费项目公司增收',amount:800})}>添加增收记录</Button><Button onClick={()=>ask('解释本团增收和毛利')}>请助手核对增收</Button></div><p>本演示记录公司增收净收益，计入收入合计，不生成应收节点。</p><Table rowKey="id" pagination={false} dataSource={incomes} columns={[...columns([['title','增收项目']]),{title:'公司增收',render:(_,r)=>money(r.amount)}]}/></>}
      {['receivables','payables'].includes(page)&&<><div className="businessActions"><Button onClick={()=>go(page==='receivables'?'source':'resources')}>查看业务来源</Button><Button onClick={()=>ask('解释本团应收应付与业务金额的差异')}>请助手对账</Button>{globalFinance&&<Button onClick={()=>go(page)}>查看本团账款</Button>}</div>{financeTable}</>}
      {page==='transactions'&&<><div className="businessActions"><Button type="primary" onClick={()=>openManual('transaction',{title:'客户团款',partner:'华东旅行社',direction:'收入',amount:20000})}>登记收支流水</Button><Button onClick={()=>go('verifications',globalFinance)}>前往核销</Button></div><Table rowKey="id" pagination={false} dataSource={transactions} columns={[...columns([['id','流水编号'],['title','摘要'],['partner','往来对象'],['direction','方向']]),{title:'金额',render:(_,r)=>money(r.amount)},{title:'未核销',render:(_,r)=>money(available(r,verifications))}]}/></>}
      {page==='verifications'&&<><div className="businessActions"><Button type="primary" disabled={!matched.length} onClick={()=>prepareFinance('核销',[matched[0]])}>请助手匹配核销</Button><Button onClick={()=>go('transactions',globalFinance)}>查看可用流水</Button></div><p>按往来对象、收支方向与可用余额匹配；每次审核一笔。没有候选时，先提交账款并登记对应流水。</p><Table rowKey="id" pagination={false} dataSource={verifications} columns={[...columns([['id','核销编号'],['scheduleId','账款'],['transactionId','流水']]),{title:'核销金额',render:(_,r)=>money(r.amount)},{title:'操作',render:(_,r)=><Button type="link" onClick={()=>{setVerifications(current=>current.filter(v=>v.id!==r.id));setNotice('核销已撤销，账款与流水可用余额恢复，原流水仍保留。');}}>撤销核销</Button>}]}/></>}
      {(page==='home'?outstanding:objectPending).length>0&&<section className="businessPending"><strong>{page==='home'?'待我处理':'本业务待处理'}</strong>{(page==='home'?outstanding:objectPending).map(key=><Button key={key} onClick={()=>openReview(key)}>{reviewNames[key]} · {names[reviewOrigins[key]?.page]} · 继续审核</Button>)}</section>}
    </section>{agentOpen&&page!=='home'&&agentPanel}</div>
    </div>
    <Drawer title="选择后续初始应付" open={payableChoices!==null} onClose={()=>setPayableChoices(null)} footer={<><Button onClick={()=>setPayableChoices(null)}>暂不处理</Button><Button type="primary" disabled={!payableIds.length} onClick={()=>{prepareFinance('提交应付',payableChoices.filter(r=>payableIds.includes(r.id)).map(r=>({id:`AP-${r.id}`,origin:r.id,title:r.title,partner:r.supplier,direction:'支出',amount:r.amount})));setPayableChoices(null);}}>准备所选应付审核</Button></>}>
      <p>仅选择已成功录入且未提交应付的资源。此处选择不写入账款，还需打开审核确认。</p>
      <Table rowKey="id" pagination={false} dataSource={payableChoices||[]} rowSelection={{selectedRowKeys:payableIds,onChange:setPayableIds}} columns={[...columns([['title','资源'],['supplier','供应商']]),{title:'总价',render:(_,r)=>money(r.amount)}]}/>
    </Drawer>
    <Drawer title={{create:'新建发团',source:'客源单',resource:'添加资源',income:'添加增收记录',transaction:'登记收支流水',visitors:'游客名单'}[manual]} open={!!manual} onClose={()=>setManual(null)} footer={<div className="businessActions"><Button onClick={()=>setManual(null)}>取消</Button>{manual!=='visitors'&&<Button type="primary" onClick={saveManual} disabled={manual!=='create'&&(manual==='source'?(!draft.partner||draft.adults<0||draft.children<0):(!draft.title||!Number.isFinite(draft.amount)||draft.amount<=0))}>保存</Button>}</div>}>
      {manual==='visitors'?<><p>来源：{source?.partner} · 已录 {source?.visitors?.length||0} / 应录 {guestCount} 位</p><Table rowKey="id" pagination={false} dataSource={(source?.visitors||[]).map(g=>({...g,gender:({unknown:'未知',male:'男',female:'女'})[g.gender]}))} columns={columns([['name','姓名'],['phone','联系电话'],['gender','性别'],['notes','备注']])}/></>:manual==='create'?<p>演示行程：日本关西赏樱 6 日 · 04-02 至 04-07 · 计划 32 人 · 张晓彤</p>:manual==='source'?<div className="manualFields"><label>客户<Input value={draft.partner} onChange={e=>setDraft({...draft,partner:e.target.value})}/></label>{[['adults','成人'],['children','儿童'],['adultPrice','成人价'],['childPrice','儿童价'],['discount','优惠'],['deposit',draft.collectionMode==='split'?'客户已收定金':'我方代收定金'],['balance','我方代收尾款']].map(([key,label])=><label key={key}>{label}<InputNumber min={0} value={draft[key]} onChange={value=>setDraft({...draft,[key]:value})}/></label>)}<label>收款方式<Select value={draft.collectionMode} onChange={value=>setDraft({...draft,collectionMode:value,deposit:null,balance:null})} options={[{value:'partner',label:'客户结算'},{value:'split',label:'分拆收款'},{value:'guest',label:'全部我方代收'}]}/></label><p>手工表单为简化演示。完整报价与名单修订请从助手提供报名材料后进入审核。</p></div>:<div className="manualFields"><label>名称 / 摘要<Input value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>{manual==='resource'&&<><label>供应商<Select value={draft.supplier} onChange={value=>setDraft({...draft,supplier:value})} options={directories.suppliers.rows.map(([value])=>({value,label:value}))}/></label><p>归属：{draft.date==='全程'?'发团级资源':draft.date}</p></>}{manual==='transaction'&&<><label>方向<Select value={draft.direction} onChange={value=>setDraft({...draft,direction:value})} options={['收入','支出'].map(value=>({value,label:value}))}/></label><label>往来对象<Select value={draft.partner} onChange={value=>setDraft({...draft,partner:value})} options={['华东旅行社','本团游客',...directories.suppliers.rows.map(([v])=>v)].map(value=>({value,label:value}))}/></label></>}<label>{manual==='income'?'公司增收净收益':'金额'}（元）<InputNumber min={0.01} precision={2} value={draft.amount} onChange={value=>setDraft({...draft,amount:value})}/></label>{manual==='transaction'&&<p>仅登记资金发生。核销后才更新账款的已收 / 已付。</p>}</div>}
    </Drawer>
  </main>;
}

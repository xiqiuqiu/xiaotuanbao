import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileAddOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import { Alert, Button, Card, Flex, Tag, Typography } from 'antd'
import type { CreateMode } from './shared'
import {
  BaseInfoForm,
  ChatComposer,
  ChatThread,
  DraftDescriptions,
  ModeSwitch,
  RouteCandidate,
  SourceHint,
  StageSteps,
} from './parts'
import styles from './ai-assisted-create-prototype.module.css'

type VariantProps = {
  mode: CreateMode
  onModeChange: (mode: CreateMode) => void
  confirmed: boolean
  onConfirm: () => void
}

function PrototypeHeader({ mode, onModeChange }: Pick<VariantProps, 'mode' | 'onModeChange'>) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <Button type="text" icon={<ArrowLeftOutlined />} className={styles.backButton}>返回发团列表</Button>
        <Typography.Title level={4} className={styles.pageTitle}>新建发团</Typography.Title>
        <Typography.Text type="secondary">表单与 AI 操作同一份发团任务草稿</Typography.Text>
      </div>
      <ModeSwitch mode={mode} onChange={onModeChange} />
    </header>
  )
}

function ConfirmationAction({ confirmed, onConfirm }: Pick<VariantProps, 'confirmed' | 'onConfirm'>) {
  return confirmed ? (
    <Alert type="success" showIcon title="发团信息已确认，下一步将进入客源单" />
  ) : (
    <Button type="primary" icon={<CheckCircleOutlined />} onClick={onConfirm}>
      确认发团信息，进入客源单
    </Button>
  )
}

/** A — 现有表单保持主场，AI 作为持续可见的右侧辅助面板。 */
export function VariantA(props: VariantProps) {
  return (
    <div className={styles.variantPage}>
      <PrototypeHeader mode={props.mode} onModeChange={props.onModeChange} />
      <Card className={styles.shellCard} styles={{ body: { padding: 0, height: '100%' } }}>
        <div className={styles.variantAGrid}>
          <aside className={styles.leftRail}>
            <Typography.Text strong>创建进度</Typography.Text>
            <StageSteps compact />
          </aside>
          <main className={styles.formWorkspace}>
            <Flex justify="space-between" align="center" gap={16} wrap="wrap">
              <div>
                <Typography.Title level={5}>发团基础信息</Typography.Title>
                <Typography.Text type="secondary">AI 已补齐候选值，你可以直接在表单中修正</Typography.Text>
              </div>
              <Tag icon={<RobotOutlined />} color="processing">AI 已填写 4 项</Tag>
            </Flex>
            <BaseInfoForm />
            <Typography.Text strong>匹配到历史路线</Typography.Text>
            <RouteCandidate />
            <Flex justify="flex-end"><ConfirmationAction confirmed={props.confirmed} onConfirm={props.onConfirm} /></Flex>
          </main>
          <aside className={styles.aiSidePanel}>
            <Flex justify="space-between" align="center">
              <Typography.Text strong>AI 建团助理</Typography.Text>
              <Tag>发团信息</Tag>
            </Flex>
            <ChatThread dense />
            <SourceHint />
            <ChatComposer />
          </aside>
        </div>
      </Card>
    </div>
  )
}

/** B — AI 对话是主工作面，结构化草稿固定在右侧提供实时反馈。 */
export function VariantB(props: VariantProps) {
  return (
    <div className={styles.variantPage}>
      <PrototypeHeader mode={props.mode} onModeChange={props.onModeChange} />
      <div className={styles.topStage}><StageSteps /></div>
      <div className={styles.variantBGrid}>
        <main className={styles.conversationWorkspace}>
          <Flex justify="space-between" align="start" gap={16} wrap="wrap">
            <div>
              <Typography.Title level={5}>先把这次发团说清楚</Typography.Title>
              <Typography.Text type="secondary">你可以自然描述，也可以随时切回表单继续填写</Typography.Text>
            </div>
            <Tag color="processing">正在收集发团信息</Tag>
          </Flex>
          <ChatThread />
          <RouteCandidate />
          <ChatComposer />
        </main>
        <aside className={styles.liveDraftPanel}>
          <Flex justify="space-between" align="center">
            <div>
              <Typography.Text strong>实时发团草稿</Typography.Text>
              <Typography.Paragraph type="secondary">以当前系统字段为准</Typography.Paragraph>
            </div>
            <Tag color="warning">2 项待确认</Tag>
          </Flex>
          {props.mode === 'form' ? <BaseInfoForm /> : <DraftDescriptions editable />}
          <SourceHint />
          <div className={styles.stickyAction}>
            <ConfirmationAction confirmed={props.confirmed} onConfirm={props.onConfirm} />
          </div>
        </aside>
      </div>
    </div>
  )
}

/** C — 以阶段任务与审核门为主轴，适合跨客源、行程、资源的长流程。 */
export function VariantC(props: VariantProps) {
  return (
    <div className={styles.variantPage}>
      <PrototypeHeader mode={props.mode} onModeChange={props.onModeChange} />
      <div className={styles.variantCGrid}>
        <aside className={styles.stageNavigator}>
          <Typography.Text strong>本次创建任务</Typography.Text>
          <Typography.Paragraph type="secondary">北疆 8 日团 · 自动保存</Typography.Paragraph>
          <StageSteps compact />
          <Button block icon={<FileAddOutlined />}>查看本次材料 0</Button>
        </aside>
        <main className={styles.stageWorkspace}>
          <Flex justify="space-between" align="start" gap={16} wrap="wrap">
            <div>
              <Typography.Text type="secondary">阶段 1 / 5</Typography.Text>
              <Typography.Title level={5}>审核发团信息候选</Typography.Title>
              <Typography.Text type="secondary">确认后才会写入正式发团字段，并开放下一阶段</Typography.Text>
            </div>
            <Tag color="warning">等待你的审核</Tag>
          </Flex>
          {props.mode === 'form' ? <BaseInfoForm /> : <DraftDescriptions editable />}
          <Typography.Text strong>推荐依据</Typography.Text>
          <RouteCandidate />
          <Flex justify="space-between" align="center" gap={16} wrap="wrap" className={styles.reviewFooter}>
            <Button>暂存并退出</Button>
            <ConfirmationAction confirmed={props.confirmed} onConfirm={props.onConfirm} />
          </Flex>
        </main>
        <aside className={styles.contextPanel}>
          <Typography.Text strong>助理与依据</Typography.Text>
          <ChatThread dense />
          <Alert
            type="info"
            showIcon
            title="下次进入时"
            description="重新读取当前正式字段和未确认候选，不依赖旧聊天内容恢复业务状态。"
          />
          <ChatComposer />
        </aside>
      </div>
    </div>
  )
}

/** D — 人工选择后的合成方向：A 的熟悉表单主场 + C 的阶段任务和审核门。 */
export function VariantD(props: VariantProps) {
  return (
    <div className={styles.variantPage}>
      <PrototypeHeader mode={props.mode} onModeChange={props.onModeChange} />
      <Card className={styles.shellCard} styles={{ body: { padding: 0, height: '100%' } }}>
        <div className={styles.variantAGrid}>
          <aside className={styles.leftRail}>
            <Typography.Text strong>本次创建任务</Typography.Text>
            <Typography.Paragraph type="secondary" className={styles.taskSubtitle}>
              北疆 8 日团 · 自动保存
            </Typography.Paragraph>
            <StageSteps compact />
            <Alert
              type="info"
              showIcon
              icon={<ClockCircleOutlined />}
              className={styles.resumeHint}
              title="可随时退出"
              description="下次从当前业务字段和未确认候选继续。"
            />
          </aside>

          <main className={styles.formWorkspace}>
            <div className={styles.reviewGateHeader}>
              <Flex justify="space-between" align="start" gap={16} wrap="wrap">
                <div>
                  <Typography.Text type="secondary">阶段 1 / 5 · 发团信息</Typography.Text>
                  <Typography.Title level={5}>审核 AI 填写的候选内容</Typography.Title>
                  <Typography.Text type="secondary">
                    当前值仍是候选；你可以直接改表单，确认后才写入正式发团字段。
                  </Typography.Text>
                </div>
                <Tag color="warning">2 项待确认</Tag>
              </Flex>
            </div>

            <BaseInfoForm />

            <Flex justify="space-between" align="center" gap={12} wrap="wrap">
              <Typography.Text strong>线路推荐与依据</Typography.Text>
              <Tag icon={<RobotOutlined />} color="processing">AI 已填写 4 项</Tag>
            </Flex>
            <RouteCandidate />

            <Flex justify="space-between" align="center" gap={16} wrap="wrap" className={styles.reviewFooter}>
              <Button>暂存并退出</Button>
              <ConfirmationAction confirmed={props.confirmed} onConfirm={props.onConfirm} />
            </Flex>
          </main>

          <aside className={styles.aiSidePanel}>
            <Flex justify="space-between" align="center">
              <Typography.Text strong>AI 建团助理</Typography.Text>
              <Tag>发团信息</Tag>
            </Flex>
            <ChatThread dense />
            <Alert
              type="info"
              showIcon
              title="AI 与表单共用当前草稿"
              description="切换模式不会复制数据；表单修改会成为下一轮 AI 的最新上下文。"
            />
            <ChatComposer />
          </aside>
        </div>
      </Card>
    </div>
  )
}

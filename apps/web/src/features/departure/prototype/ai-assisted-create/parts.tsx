import {
  CheckCircleOutlined,
  EditOutlined,
  FileSearchOutlined,
  FormOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import {
  Button,
  Descriptions,
  Flex,
  Input,
  Segmented,
  Space,
  Steps,
  Tag,
  Typography,
} from 'antd'
import type { CreateMode } from './shared'
import { CHAT_MESSAGES, DRAFT_FIELDS, STAGES } from './shared'
import styles from './ai-assisted-create-prototype.module.css'

export function ModeSwitch({ mode, onChange }: { mode: CreateMode; onChange: (mode: CreateMode) => void }) {
  return (
    <Segmented
      value={mode}
      options={[
        { label: '表单录入', value: 'form', icon: <FormOutlined /> },
        { label: 'AI 助理', value: 'ai', icon: <RobotOutlined /> },
      ]}
      onChange={(value) => onChange(value as CreateMode)}
    />
  )
}

export function StageSteps({ compact = false }: { compact?: boolean }) {
  return (
    <Steps
      current={0}
      size="small"
      orientation={compact ? 'vertical' : 'horizontal'}
      responsive={false}
      items={STAGES.map((stage) => ({ title: stage.title, status: stage.status }))}
    />
  )
}

export function ChatThread({ dense = false }: { dense?: boolean }) {
  return (
    <div className={dense ? styles.chatThreadDense : styles.chatThread}>
      {CHAT_MESSAGES.map((message, index) => (
        <div
          key={`${message.role}-${index}`}
          className={message.role === 'user' ? styles.userMessage : styles.assistantMessage}
        >
          <Typography.Text>{message.text}</Typography.Text>
        </div>
      ))}
    </div>
  )
}

export function ChatComposer() {
  return (
    <div className={styles.composer}>
      <Input.TextArea
        autoSize={{ minRows: 2, maxRows: 4 }}
        placeholder="继续补充，或粘贴业务材料中的文字…"
        aria-label="回复 AI 助理"
      />
      <Flex justify="space-between" align="center" gap={8}>
        <Button icon={<FileSearchOutlined />}>上传材料</Button>
        <Button type="primary">发送</Button>
      </Flex>
    </div>
  )
}

export function DraftDescriptions({ editable = false }: { editable?: boolean }) {
  return (
    <Descriptions
      size="small"
      column={1}
      colon={false}
      items={DRAFT_FIELDS.map((field) => ({
        key: field.label,
        label: field.label,
        children: (
          <Flex justify="space-between" align="center" gap={12} wrap="wrap">
            <Space size={8}>
              <Typography.Text strong={field.label === '线路名称'}>{field.value}</Typography.Text>
              <Tag color={field.status === '已确认' ? 'success' : field.status === '待确认' ? 'warning' : undefined}>
                {field.status}
              </Tag>
            </Space>
            {editable ? <Button type="link" size="small" icon={<EditOutlined />}>修改</Button> : null}
          </Flex>
        ),
      }))}
    />
  )
}

export function RouteCandidate() {
  return (
    <div className={styles.routeCandidate}>
      <Flex justify="space-between" align="start" gap={16} wrap="wrap">
        <div>
          <Space size={8}>
            <Typography.Text strong>北疆经典 8 日</Typography.Text>
            <Tag color="processing">匹配度高</Tag>
          </Space>
          <Typography.Paragraph type="secondary" className={styles.routeText}>
            乌鲁木齐 → 可可托海 → 布尔津 → 喀纳斯 → 禾木 → 乌尔禾
          </Typography.Paragraph>
          <Typography.Text type="secondary">历史使用 16 次 · 最近使用于 2026-07-18</Typography.Text>
        </div>
        <Button icon={<CheckCircleOutlined />}>采用该路线</Button>
      </Flex>
    </div>
  )
}

export function BaseInfoForm() {
  return (
    <div className={styles.formGrid}>
      <label>
        <Typography.Text>线路名称</Typography.Text>
        <Input defaultValue="北疆经典 8 日" />
      </label>
      <label>
        <Typography.Text>出团日期</Typography.Text>
        <Input defaultValue="2026-08-20" />
      </label>
      <label>
        <Typography.Text>结束日期</Typography.Text>
        <Input defaultValue="2026-08-27" />
      </label>
      <label>
        <Typography.Text>预计人数</Typography.Text>
        <Input defaultValue="22" suffix="人" />
      </label>
    </div>
  )
}

export function SourceHint() {
  return (
    <div className={styles.sourceHint}>
      <Typography.Text type="secondary">字段来源</Typography.Text>
      <Typography.Text>用户回答 2 项 · AI 推荐 1 项 · 系统计算 1 项</Typography.Text>
    </div>
  )
}


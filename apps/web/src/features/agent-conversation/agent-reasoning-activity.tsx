import type { ReactActivityMessageRenderer } from '@copilotkit/react-core/v2'
import { RightOutlined } from '@ant-design/icons'
import { Collapse, Typography } from 'antd'
import {
  AGENT_REASONING_ACTIVITY_TYPE,
  type AgentReasoningActivityContent,
} from '@/features/ai-assist/ai-create-copilot-messages'
import styles from '@/features/ai-assist/AiCreateAssistChat.module.css'

export function createAgentReasoningActivityRenderer(): ReactActivityMessageRenderer<AgentReasoningActivityContent> {
  return {
    activityType: AGENT_REASONING_ACTIVITY_TYPE,
    content: {
      '~standard': {
        version: 1,
        vendor: 'xiaotuanbao',
        validate(value) {
          if (
            value &&
            typeof value === 'object' &&
            typeof (value as { reasoningText?: unknown }).reasoningText === 'string' &&
            (value as { reasoningText: string }).reasoningText.length > 0
          ) {
            return { value: value as AgentReasoningActivityContent }
          }
          return { issues: [{ message: 'invalid agent reasoning activity' }] }
        },
      },
    },
    render: ({ content }) => (
      <Collapse
        ghost
        size="small"
        defaultActiveKey={['reasoning']}
        expandIcon={({ isActive }) => (
          <RightOutlined rotate={isActive ? 90 : 0} aria-hidden />
        )}
        items={[
          {
            key: 'reasoning',
            label: '思考过程',
            children: (
              <Typography.Text type="secondary" aria-live="polite" className={styles.reasoningText}>
                {content.reasoningText}
              </Typography.Text>
            ),
          },
        ]}
      />
    ),
  }
}

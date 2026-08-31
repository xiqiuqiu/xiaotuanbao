import { useState } from 'react'
import { Button, Typography } from 'antd'
import {
  ChatWorkingMascot,
  Mascot,
  MASCOT_PRESET_RESOLUTION,
  type ChatWorkingBeatMode,
  type MascotPreset,
} from '@/components/mascot'
import styles from './MascotAuditPage.module.css'

const PRESET_CARDS: Array<{
  preset: MascotPreset
  label: string
  mapping: string
}> = [
  { preset: 'idle', label: 'idle', mapping: 'hold idle · gaze + blink（baseBody）' },
  { preset: 'thinking', label: 'thinking', mapping: 'hold thinking · 三点脉冲（baseBody false）' },
  {
    preset: 'working',
    label: 'working',
    mapping: 'cycle play→orbit→burst→comet（会离开胶囊）',
  },
  { preset: 'success', label: 'success', mapping: 'hold notify · 蓝点 pop' },
  { preset: 'error', label: 'error', mapping: 'hold alert' },
  { preset: 'sleep', label: 'sleep', mapping: 'hold sleep' },
]

const BEAT_CARDS: Array<{
  beat: ChatWorkingBeatMode
  title: string
  caption: string
}> = [
  { beat: 'look', title: 'look', caption: '眼睛左右看（船体静止）' },
  { beat: 'blink', title: 'blink', caption: '眨眼（眼组独立 scaleY）' },
  { beat: 'squash', title: 'squash', caption: '身体挤压形变' },
  { beat: 'flip', title: 'flip', caption: '旋转空翻 + 拖尾随船体' },
  { beat: 'halo', title: 'halo', caption: '彩色圆环绕着胶囊' },
  { beat: 'trails', title: 'trails', caption: '彩虹拖尾黏在胶囊左侧' },
  { beat: 'loop', title: 'loop', caption: '全循环（聊天 reasoning 槽使用）' },
]

/**
 * Dev audit page: (A) current engine presets, (B) capsule chat-working beats.
 * No CopilotKit — Betty can open and click each clip before chat wiring expands.
 */
export function MascotAuditPage() {
  const [selectedBeat, setSelectedBeat] = useState<ChatWorkingBeatMode>('loop')
  const [sectionBPlaying, setSectionBPlaying] = useState(true)

  return (
    <div className={styles.page} data-testid="mascot-audit-page">
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Mascot 审计
      </Typography.Title>
      <p className={styles.intro}>
        上区是系统现有 Agent preset（引擎实测状态，含三点/三角）。下区是思考推理时的胶囊样式（待确认）。
        聊天槽目前只挂下区 <code>loop</code>，不绑定 idle/success/error/sleep。
      </p>

      <section className={styles.section} data-testid="mascot-audit-presets">
        <h2 className={styles.sectionTitle}>A. 系统现有 Agent 状态（mascot presets）</h2>
        <p className={styles.sectionHint}>
          使用现有 {'<Mascot preset … shape="capsule" color="gris" />'}
          ，展示引擎今天实际画什么（含可拒绝的形态）。
        </p>
        <div className={styles.grid}>
          {PRESET_CARDS.map((card) => {
            const resolution = MASCOT_PRESET_RESOLUTION[card.preset]
            const detail = resolution.cycle
              ? `cycle: ${resolution.cycle.join(' → ')}`
              : `state: ${resolution.state}`
            return (
              <div
                key={card.preset}
                className={styles.card}
                data-testid={`mascot-audit-preset-${card.preset}`}
              >
                <div className={styles.cardTitle}>{card.label}</div>
                <div className={styles.cardMeta}>
                  {card.mapping}
                  <br />
                  {detail}
                </div>
                <div className={styles.stageRow}>
                  <div className={styles.stage}>
                    <Mascot
                      preset={card.preset}
                      size={56}
                      color="gris"
                      shape="capsule"
                      paper="#f9f9f9"
                      follow={false}
                    />
                    <span className={styles.stageLabel}>56</span>
                  </div>
                  <div className={styles.stage}>
                    <Mascot
                      preset={card.preset}
                      size={120}
                      color="gris"
                      shape="capsule"
                      paper="#f9f9f9"
                      follow={false}
                    />
                    <span className={styles.stageLabel}>120</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className={styles.section} data-testid="mascot-audit-beats">
        <h2 className={styles.sectionTitle}>B. 思考推理时的动画样式（胶囊，待确认）</h2>
        <p className={styles.sectionHint}>
          ChatWorkingMascot：灰色水平胶囊 + 白缝眼睛。点选卡片 hold 该拍；「播放全循环」切到 loop。
        </p>
        <div className={styles.toolbar}>
          <Button
            type={selectedBeat === 'loop' && sectionBPlaying ? 'primary' : 'default'}
            onClick={() => {
              setSelectedBeat('loop')
              setSectionBPlaying(true)
            }}
          >
            播放全循环 (loop)
          </Button>
          <Button onClick={() => setSectionBPlaying((v) => !v)}>
            {sectionBPlaying ? '暂停' : '继续'}
          </Button>
        </div>
        <div className={styles.grid}>
          {BEAT_CARDS.map((card) => {
            const selected = selectedBeat === card.beat
            return (
              <button
                key={card.beat}
                type="button"
                className={[
                  styles.card,
                  styles.cardInteractive,
                  selected ? styles.cardSelected : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-testid={`mascot-audit-beat-${card.beat}`}
                onClick={() => {
                  setSelectedBeat(card.beat)
                  setSectionBPlaying(true)
                }}
              >
                <div className={styles.cardTitle}>{card.title}</div>
                <div className={styles.cardMeta}>{card.caption}</div>
                <div className={styles.stageRow}>
                  <div className={styles.stage}>
                    <ChatWorkingMascot
                      beat={card.beat}
                      size={56}
                      playing={sectionBPlaying}
                    />
                    <span className={styles.stageLabel}>56</span>
                  </div>
                  <div className={styles.stage}>
                    <ChatWorkingMascot
                      beat={card.beat}
                      size={120}
                      playing={sectionBPlaying}
                    />
                    <span className={styles.stageLabel}>120</span>
                  </div>
                </div>
                <div className={styles.beatAttr}>data-mascot-beat-mode={card.beat}</div>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

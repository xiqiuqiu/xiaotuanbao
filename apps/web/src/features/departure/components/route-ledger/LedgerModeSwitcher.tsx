import { Radio } from 'antd'

export type LedgerViewMode = 'income' | 'cost' | 'outsource'

const MODE_OPTIONS: Array<{ label: string; value: LedgerViewMode }> = [
  { label: '客源收入', value: 'income' },
  { label: '执行成本', value: 'cost' },
  { label: '拼出往来', value: 'outsource' },
]

type LedgerModeSwitcherProps = {
  value: LedgerViewMode
  onChange: (value: LedgerViewMode) => void
}

/** 一团日报：Radio 实心按钮组切换收入/成本/拼出。 */
export function LedgerModeSwitcher({ value, onChange }: LedgerModeSwitcherProps) {
  return (
    <Radio.Group
      size="small"
      optionType="button"
      buttonStyle="solid"
      value={value}
      onChange={(event) => onChange(event.target.value as LedgerViewMode)}
      options={MODE_OPTIONS}
    />
  )
}

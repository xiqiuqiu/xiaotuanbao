import { useEffect } from 'react'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import { Button, Typography } from 'antd'
import { useNavigate } from '@tanstack/react-router'
import styles from './PrototypeSwitcher.module.css'

export type PrototypeVariantOption = {
  key: string
  label: string
}

type PrototypeSwitcherProps = {
  variants: PrototypeVariantOption[]
  current: string
  searchKey?: string
  /** 0 = 最底；1+ 向上堆叠，避免多条浮动条重叠 */
  stackIndex?: number
}

function cycleVariant(
  variants: PrototypeVariantOption[],
  current: string,
  direction: -1 | 1,
): string {
  const index = variants.findIndex((item) => item.key === current)
  const safeIndex = index >= 0 ? index : 0
  const nextIndex = (safeIndex + direction + variants.length) % variants.length
  return variants[nextIndex]?.key ?? variants[0]?.key ?? current
}

/** Fixed bottom bar for throwaway UI prototypes — DEV only. */
export function PrototypeSwitcher({
  variants,
  current,
  searchKey = 'variant',
  stackIndex = 0,
}: PrototypeSwitcherProps) {
  const navigate = useNavigate()
  const currentVariant =
    variants.find((item) => item.key === current) ?? variants[0]

  function goToVariant(next: string) {
    void navigate({
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        [searchKey]: next,
      })) as never,
      replace: true,
    })
  }

  useEffect(() => {
    if (import.meta.env.PROD) {
      return
    }

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goToVariant(cycleVariant(variants, current, -1))
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        goToVariant(cycleVariant(variants, current, 1))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  if (import.meta.env.PROD || variants.length === 0) {
    return null
  }

  return (
    <div
      className={styles.bar}
      style={{ bottom: 20 + stackIndex * 48 }}
      role="toolbar"
      aria-label="原型方案切换"
    >
      <Button
        type="text"
        size="small"
        icon={<LeftOutlined />}
        aria-label="上一个方案"
        onClick={() => goToVariant(cycleVariant(variants, current, -1))}
      />
      <Typography.Text className={styles.label}>
        {currentVariant?.key} — {currentVariant?.label}
      </Typography.Text>
      <Button
        type="text"
        size="small"
        icon={<RightOutlined />}
        aria-label="下一个方案"
        onClick={() => goToVariant(cycleVariant(variants, current, 1))}
      />
    </div>
  )
}

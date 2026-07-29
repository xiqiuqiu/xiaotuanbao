/**
 * PROTOTYPE — throwaway UI switcher. Do not ship to production consumers.
 * Hidden when import.meta.env.PROD.
 */
import { useEffect } from 'react'
import { Button, Flex, Typography } from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'

export type PrototypeVariantOption = {
  key: string
  label: string
}

type PrototypeSwitcherProps = {
  variants: PrototypeVariantOption[]
  current: string
  onChange: (key: string) => void
}

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
}: PrototypeSwitcherProps) {
  const index = Math.max(
    0,
    variants.findIndex((item) => item.key === current),
  )
  const currentOption = variants[index] ?? variants[0]

  useEffect(() => {
    if (import.meta.env.PROD || variants.length === 0) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        const delta = event.key === 'ArrowLeft' ? -1 : 1
        const next = (index + delta + variants.length) % variants.length
        onChange(variants[next]!.key)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [index, onChange, variants])

  if (import.meta.env.PROD) {
    return null
  }

  const go = (delta: number) => {
    if (variants.length === 0) {
      return
    }
    const next = (index + delta + variants.length) % variants.length
    onChange(variants[next]!.key)
  }

  return (
    <Flex
      align="center"
      gap={8}
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        zIndex: 1100,
        padding: '8px 12px',
        borderRadius: 999,
        background: '#1f1f1f',
        color: '#fff',
        boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
      }}
    >
      <Button
        type="text"
        size="small"
        icon={<LeftOutlined style={{ color: '#fff' }} />}
        aria-label="上一方案"
        onClick={() => go(-1)}
      />
      <Typography.Text style={{ color: '#fff', minWidth: 220, textAlign: 'center' }}>
        {currentOption?.key} — {currentOption?.label}
      </Typography.Text>
      <Button
        type="text"
        size="small"
        icon={<RightOutlined style={{ color: '#fff' }} />}
        aria-label="下一方案"
        onClick={() => go(1)}
      />
    </Flex>
  )
}

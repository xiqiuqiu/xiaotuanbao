import { render, screen } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { describe, expect, it } from 'vitest'
import { EllipsisTooltipText } from './EllipsisTooltipText'

describe('EllipsisTooltipText', () => {
  it('renders placeholder for null/undefined/empty values', () => {
    const { rerender } = render(
      <ConfigProvider>
        <EllipsisTooltipText>{null}</EllipsisTooltipText>
      </ConfigProvider>,
    )
    expect(screen.getByText('-')).toBeInTheDocument()

    rerender(
      <ConfigProvider>
        <EllipsisTooltipText empty="">{"\u00a0"}</EllipsisTooltipText>
      </ConfigProvider>,
    )
  })

  it('keeps full text in the DOM so truncated cells remain observable via tooltip', () => {
    render(
      <ConfigProvider>
        <div style={{ width: 40 }}>
          <EllipsisTooltipText>很长的备注内容需要悬停才能看全</EllipsisTooltipText>
        </div>
      </ConfigProvider>,
    )

    const text = screen.getByText('很长的备注内容需要悬停才能看全')
    expect(text).toBeInTheDocument()
    // Typography ellipsis enables antd Tooltip when content overflows
    expect(text.className).toMatch(/ant-typography/)
  })
})

import { cleanup, render, screen } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DepartureSummary, PartnerSummary } from '@/types/api'
import nameLinkStyles from '@/layouts/TableNameLink.module.css'
import { buildDepartureColumns } from '@/features/departure/pages/departure-columns'
import { buildPartnerColumns } from '@/features/partner/pages/partner-columns'

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  )
  return {
    ...actual,
    useQueryClient: () => ({ prefetchQuery: vi.fn() }),
  }
})

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) => (
    <a href="/detail" className={className}>
      {children}
    </a>
  ),
}))

function renderNameColumn(
  title: string,
  columns: Array<{ title?: unknown; dataIndex?: unknown; render?: (...args: never[]) => unknown }>,
  record: Record<string, unknown>,
) {
  const column = columns.find((item) => item.title === title)
  expect(column?.render).toBeTypeOf('function')
  const value = column?.dataIndex ? record[String(column.dataIndex)] : undefined
  return render(
    <ConfigProvider>{column!.render!(value as never, record as never, 0)}</ConfigProvider>,
  )
}

describe('业务列表名称列蓝色链接样式', () => {
  afterEach(() => {
    cleanup()
  })

  it('发团列表团名列挂载 TableNameLink，且省略文本继承链接色', () => {
    const record = { id: 'dep-1', name: '南疆6日游 7月22日团' } as DepartureSummary
    renderNameColumn(
      '团名',
      buildDepartureColumns({ onCopy: vi.fn(), onPurge: vi.fn() }, true),
      record,
    )

    const link = screen.getByRole('link', { name: '南疆6日游 7月22日团' })
    expect(link).toHaveClass(nameLinkStyles.nameLink)

    const text = link.querySelector('.ant-typography')
    expect(text).toBeInstanceOf(HTMLElement)
    // Inline inherit — getComputedStyle resolves to the parent link color.
    expect((text as HTMLElement).style.color).toBe('inherit')
  })

  it('合作伙伴名称列挂载 TableNameLink，且省略文本继承链接色', () => {
    const record = { id: 'partner-1', name: '杭州同行' } as PartnerSummary
    renderNameColumn(
      '合作伙伴名称',
      buildPartnerColumns(false, vi.fn(), vi.fn(), vi.fn(), true),
      record,
    )

    const link = screen.getByRole('link', { name: '杭州同行' })
    expect(link).toHaveClass(nameLinkStyles.nameLink)

    const text = link.querySelector('.ant-typography')
    expect(text).toBeInstanceOf(HTMLElement)
    expect((text as HTMLElement).style.color).toBe('inherit')
  })
})

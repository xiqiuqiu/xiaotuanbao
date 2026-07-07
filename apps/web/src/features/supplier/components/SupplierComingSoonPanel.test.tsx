import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SupplierComingSoonPanel } from './SupplierComingSoonPanel'

describe('SupplierComingSoonPanel', () => {
  it('shows coming soon placeholder text', () => {
    render(<SupplierComingSoonPanel />)
    expect(screen.getByText('功能建设中，暂不可用')).toBeInTheDocument()
  })
})

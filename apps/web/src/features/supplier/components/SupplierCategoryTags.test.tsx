import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ResourceKind } from '@xiaotuanbao/shared'
import { SupplierCategoryTags } from './SupplierCategoryTags'

describe('SupplierCategoryTags', () => {
  it('renders each selected category as its own Tag', () => {
    render(
      <SupplierCategoryTags categories={[ResourceKind.HOTEL, ResourceKind.MEAL]} />,
    )

    const hotel = screen.getByText('酒店')
    const meal = screen.getByText('用餐')
    expect(hotel.closest('.ant-tag')).toBeTruthy()
    expect(meal.closest('.ant-tag')).toBeTruthy()
    expect(screen.queryByText('酒店、用餐')).not.toBeInTheDocument()
  })

  it('renders an em dash when categories are empty', () => {
    render(<SupplierCategoryTags categories={[]} />)
    expect(screen.getByText('-')).toBeInTheDocument()
  })
})

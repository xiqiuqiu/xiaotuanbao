import { Space, Tag } from 'antd'
import { SUPPLIER_CATEGORY_LABELS } from '../catalog'

interface SupplierCategoryTagsProps {
  categories: readonly string[]
}

export function SupplierCategoryTags({ categories }: SupplierCategoryTagsProps) {
  if (!categories.length) {
    return <>—</>
  }

  return (
    <Space size={[4, 4]} wrap>
      {categories.map((kind) => (
        <Tag key={kind} style={{ marginInlineEnd: 0 }}>
          {SUPPLIER_CATEGORY_LABELS[kind as keyof typeof SUPPLIER_CATEGORY_LABELS] ?? kind}
        </Tag>
      ))}
    </Space>
  )
}

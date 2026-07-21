/** Product Status：草稿 / 销售中 / 已下架（CONTEXT Product Center） */
export enum ProductStatus {
  DRAFT = 'draft',
  ON_SALE = 'on_sale',
  OFF_SHELF = 'off_shelf',
}

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  [ProductStatus.DRAFT]: '草稿',
  [ProductStatus.ON_SALE]: '销售中',
  [ProductStatus.OFF_SHELF]: '已下架',
}

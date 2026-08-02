/**
 * @deprecated Import from `./supplier-quick-create` instead.
 * Re-exports kept so existing ResourceDrawer imports keep working during rollout.
 */
export {
  SUPPLIER_QUICK_CREATE_OPTION_VALUE as RESOURCE_SUPPLIER_CREATE_OPTION_VALUE,
  formatSupplierQuickCreateOptionLabel as formatResourceSupplierCreateOptionLabel,
  findSupplierByExactName,
  shouldShowResourceSupplierCreateOption,
  resolveDuplicateSupplierSelection,
  createOrResolveSupplierByName,
  duplicateSupplierWarningMessage,
} from './supplier-quick-create'

# 全局 Role Catalog，不按 Organization 隔离

第一版 Preset Role（企业管理员、财务、计调）及其 Menu Permission 映射在全平台共享：`Role`、`Permission`、`RolePermission` 不带 `organizationId`；`UserRole` 将 Organization 内的 User 绑到全局 Role。曾考虑每个 Organization 各 seed 一套 Role 副本，但 Preset Role 定义固定且全平台一致，全局 catalog 更简单，改 seed 一处全平台生效；租户边界由 `User.organizationId` 与 `UserRole` 保证。

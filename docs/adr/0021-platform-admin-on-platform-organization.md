# Platform Admin 挂靠 Platform Organization，平台区与租户后台分离

Platform Admin 与客户 Organization 内的 User 共用登录体系，但仍须满足「User 必属一家 Organization」。决定新建专用 **Platform Organization** 供全部 Platform Admin 挂靠：登录后只进入同一 Web 应用内的 `/platform/*`，不使用该壳组织的租户后台，也不走 Organization 的 Menu Permission。客户 Organization 名录不展示、不停用 Platform Organization。曾考虑让 `organizationId` 可空（平台身份不隶属任何组织），但会动摇登录唯一性、会话结构与大量「必有 organizationId」假设；也曾考虑把 Platform Admin 挂在真实客户 Organization 下，但客户停用会误伤平台账号、且平台与租户身份混杂。另起独立前端应用成本过高，故平台台与租户后台同仓分区即可。

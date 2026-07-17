# Login Username 全平台唯一，登录不依赖 Organization 消歧

登录须唯一命中一个 User，但 User 只隶属一家 Organization，且 Login Username 曾只保证组织内唯一，与全局 `findFirst(username)` 不一致。决定：**Login Username 全平台唯一**（含 Platform Admin 与客户员工同一命名空间），持久化与查找均 **trim 后转小写**；登录页只填用户名与密码，**不**增加 Organization 标识。曾考虑登录时加填组织 id/业务前缀消歧以保留组织内可重复短名，但日常登录摩擦大、平台与租户共用登录页时规则更绕；也曾考虑维持组织内唯一并靠运营避让，但开户常用名（如 `admin`）会随客户数放大登错人风险。存量以当前环境无冲突为前提收紧约束，发现冲突则失败告警、不自动改名。未软删的 User（含停用员工与停用组织下的用户）均继续占用登录名。

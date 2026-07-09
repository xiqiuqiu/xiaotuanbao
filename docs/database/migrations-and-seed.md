# 数据库迁移与 Seed

使用 Prisma Migration 管理数据库结构变更。

## 本地开发迁移

```bash
pnpm db:migrate
```

等价于 `pnpm --filter api prisma:migrate:dev`，会：

1. 对比 `schema.prisma` 与数据库
2. 生成 migration 文件到 `apps/api/prisma/migrations/`
3. 应用到本地数据库
4. 重新生成 Prisma Client

### 修改 schema 后的流程

1. 编辑 `apps/api/prisma/schema.prisma`
2. 运行 `pnpm db:migrate`
3. 输入 migration 名称
4. 提交 schema + migration 文件到 Git

## Docker / 生产迁移

API 容器启动时自动执行：

```bash
pnpm exec prisma migrate deploy
```

手动执行：

```bash
pnpm docker:migrate
```

`migrate deploy` 仅 apply 已有 migration，不生成新文件。

生产 API 镜像只安装 runtime 依赖（含 Prisma CLI，供启动时 migrate）；`docker:seed` 走编译后的 `dist/prisma/seed.js`，不依赖 `tsx`。

## Seed 初始化

```bash
# 本地
pnpm db:seed

# Docker
pnpm docker:seed
```

### 默认演示数据

| 项 | 值 |
| -- | -- |
| Organization | 演示旅行社 |
| 用户名 | admin |
| 密码 | admin123 |
| 显示名 | 演示管理员 |

可通过 `.env` 中 `SEED_*` 变量自定义。

### 重新 Seed

Seed 检测到 Organization 已存在时会跳过。若需重建：

**方式一：仅删演示数据**

```bash
docker compose exec postgres psql -U xiaotuanbao -d xiaotuanbao \
  -c 'DELETE FROM users; DELETE FROM organizations;'
pnpm db:seed    # 或 pnpm docker:seed
```

**方式二：清空数据库 volume（⚠️ 删除全部数据）**

```bash
pnpm docker:down
docker volume rm xiaotuanbao_postgres_data
pnpm docker:up
pnpm docker:seed
```

## Prisma 常用命令

在 `apps/api` 目录下（或通过 pnpm filter）：

| 命令 | 说明 |
| ---- | ---- |
| `pnpm prisma:generate` | 生成 Prisma Client |
| `pnpm prisma:migrate:dev` | 开发迁移 |
| `pnpm prisma:migrate:deploy` | 生产 apply |
| `pnpm prisma:db:seed` | 执行 seed |

本地 Prisma 命令通过 `dotenv -e ../../.env` 读取根目录环境变量。

## Migration 文件位置

```txt
apps/api/prisma/
  schema.prisma
  seed.ts
  migrations/
    20260706144451_init/
      migration.sql
    migration_lock.toml
```

Migration 文件**必须提交到 Git**。

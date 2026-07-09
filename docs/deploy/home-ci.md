# 家庭服务器 CI/CD（armbian）

通过 GitHub Actions 构建 `linux/arm64` 镜像并推到 GHCR，再经 Tailscale SSH 在家里服务器上 `pull` 并启动。公网入口走 Cloudflare Tunnel → `127.0.0.1:8088`。

## 架构

```txt
git tag v* / 手动 Run workflow
        ↓
GitHub Actions（buildx arm64）
        ↓
GHCR：xiaotuanbao-api / xiaotuanbao-web
        ↓
Tailscale SSH → armbian
        ↓
/mnt/mydata/xiaotuanbao
  docker compose -f docker-compose.yml -f docker-compose.home.yml up -d
        ↓
Caddy 127.0.0.1:8088 → Cloudflare Tunnel → 公网域名
```

相关文件：

| 文件 | 作用 |
| ---- | ---- |
| [docker-compose.home.yml](../../docker-compose.home.yml) | 家庭覆盖：GHCR 镜像 + 本机 8088 |
| [scripts/remote-deploy-home.sh](../../scripts/remote-deploy-home.sh) | 服务器端部署脚本 |
| [.github/workflows/deploy-home.yml](../../.github/workflows/deploy-home.yml) | 构建、推送、远程部署 |

## 一次性准备

### 1. 服务器目录与代码

```bash
sudo mkdir -p /mnt/mydata/xiaotuanbao
sudo chown "$USER":"$USER" /mnt/mydata/xiaotuanbao   # 若用 root 可省略
git clone https://github.com/xiqiuqiu/xiaotuanbao.git /mnt/mydata/xiaotuanbao
cd /mnt/mydata/xiaotuanbao
# 确保已包含 home CI 文件（compose overlay、remote-deploy 脚本）
git checkout main && git pull
chmod +x scripts/remote-deploy-home.sh
```

### 2. 生产 `.env`

```bash
cp .env.example .env
```

至少修改：

- `JWT_SECRET`、`POSTGRES_PASSWORD`：强随机值
- `CADDY_DOMAIN=:80`（TLS 由 Cloudflare 终止）
- `VITE_APP_ENV=production`（仅作记录；前端构建参数在 Actions 里已写死为 production）
- 按需改 `SEED_*`（首次 `docker compose ...` 起来后可手动 `pnpm docker:seed` 等价操作：`docker compose exec api pnpm exec prisma db seed`）

不要把 `.env` 提交进 Git。

### 3. 登录 GHCR（私有包时）

若 Package 为 private，在服务器执行一次：

```bash
# 使用仅有 read:packages 的 PAT
echo "$GHCR_PAT" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

若将 `xiaotuanbao-api` / `xiaotuanbao-web` 设为 public，可跳过。

### 4. Cloudflare Tunnel

在 Zero Trust → Networks → Tunnels 中，为现有 tunnel 增加 Public Hostname：

- Service：`http://127.0.0.1:8088`

服务器上已有 `cloudflared` 时，一般只需改控制台路由，不必重装。

### 5. Tailscale：OAuth + ACL

1. 在 [Tailscale Admin](https://login.tailscale.com/admin/settings/oauth) 创建 OAuth client：
   - Scope：可写 `auth_keys`
   - Tags：至少包含 `tag:ci`（需先在 ACL 里定义该 tag）
2. 将 Client ID / Secret 配到 GitHub Secrets（见下表）
3. ACL 示例（按你 tailnet 现有策略合并）：

先给 armbian 打上设备 tag（例如 `tag:server`），再合并类似策略：

```json
{
  "tagOwners": {
    "tag:ci": ["autogroup:admin"],
    "tag:server": ["autogroup:admin"]
  },
  "ssh": [
    {
      "action": "accept",
      "src": ["tag:ci"],
      "dst": ["tag:server"],
      "users": ["root"]
    }
  ],
  "acls": [
    {
      "action": "accept",
      "src": ["tag:ci"],
      "dst": ["tag:server:22"]
    }
  ]
}
```

若 armbian 使用 Tailscale SSH，确保 `tag:ci` 被允许以 `root` 登录该节点。Workflow 里用 MagicDNS 主机名 `armbian`（可用 Variable `DEPLOY_HOST` 覆盖）。

### 6. GitHub Secrets / Variables

| 类型 | 名称 | 说明 |
| ---- | ---- | ---- |
| Secret | `TS_OAUTH_CLIENT_ID` | Tailscale OAuth client id |
| Secret | `TS_OAUTH_SECRET` | Tailscale OAuth client secret |
| Variable（可选） | `DEPLOY_HOST` | 默认 `armbian` |

推送 GHCR 使用 workflow 内置 `GITHUB_TOKEN`（已声明 `packages: write`）。

首次跑通前，建议在仓库 Settings → Actions → General 确认 Actions 已启用；打 tag 后可在 Actions 页查看 **Deploy Home**。

## 日常发版

```bash
# 合并到 main 后打 tag 并推送
git checkout main
git pull
git tag v0.1.0
git push origin v0.1.0
```

或：GitHub → Actions → **Deploy Home** → Run workflow，填写 `image_tag`（如 `v0.1.0` 或某 commit 上的分支名）。

成功后：

- 镜像：`ghcr.io/xiqiuqiu/xiaotuanbao-api:<tag>`、`...-web:<tag>`（`v*` 还会打 `latest`）
- 服务器：`IMAGE_TAG=<tag>` 拉取并重启
- 健康检查：`http://127.0.0.1:8088/api/health`（服务器本机）

## 服务器上手动部署

CI 不可用时，可在已 login GHCR 的服务器上：

```bash
cd /mnt/mydata/xiaotuanbao
git fetch --tags && git checkout v0.1.0
IMAGE_TAG=v0.1.0 ./scripts/remote-deploy-home.sh
```

## 本地验证 compose 覆盖

```bash
docker compose -f docker-compose.yml -f docker-compose.home.yml config
```

应看到 `api`/`web` 为 `ghcr.io/...` 镜像、无 `build`，且 Caddy 端口为 `127.0.0.1:8088:80`。

本地日常开发仍用原来的 `pnpm docker:up`（不要加 `docker-compose.home.yml`）。

## 故障排查

| 现象 | 排查 |
| ---- | ---- |
| Actions 连不上 armbian | OAuth/tag、ACL、MagicDNS；看 deploy job 的 Tailscale ping |
| `docker pull` 401 | 服务器 `docker login ghcr.io`；或把 Package 设为 public |
| health 失败 | `docker compose -f docker-compose.yml -f docker-compose.home.yml logs api caddy` |
| 端口冲突 | 确认只有 home overlay 映射 8088，且未被其它进程占用 |
| 内存紧张 | 部署窗口尽量少跑重容器；本流程不在机上 build |

## 相关文档

- [Docker 部署指南](./docker-deploy.md)
- [环境变量说明](./environment-variables.md)
- [运维操作手册](./operations.md)
- [Caddy 配置说明](./caddy.md)

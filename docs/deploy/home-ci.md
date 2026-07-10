# 家庭服务器构建与部署（armbian）

GitHub Actions **只构建** `linux/arm64` 镜像并推到 GHCR；**不**经 Tailscale SSH 自动部署。公网入口：Cloudflare Tunnel → `127.0.0.1:8088`。

## 架构

```txt
手动 Run workflow / git tag v*
        ↓
GitHub Actions（buildx arm64）→ GHCR
        ↓
你在 Mac 拉镜像（或服务器直拉）→ 传到 armbian → compose up
        ↓
Caddy 127.0.0.1:8088 → Cloudflare Tunnel → 公网域名
```

相关文件：

| 文件 | 作用 |
| ---- | ---- |
| [docker-compose.home.yml](../../docker-compose.home.yml) | 家庭覆盖：GHCR 镜像 + 本机 8088 |
| [scripts/remote-deploy-home.sh](../../scripts/remote-deploy-home.sh) | 服务器端手动部署脚本（pull + up + health） |
| [.github/workflows/deploy-home.yml](../../.github/workflows/deploy-home.yml) | 仅构建并推送镜像（workflow 名：**Build Home Images**） |

## 一次性准备

### 1. 服务器目录与代码

```bash
sudo mkdir -p /mnt/mydata/xiaotuanbao
sudo chown "$USER":"$USER" /mnt/mydata/xiaotuanbao   # 若用 root 可省略
git clone https://github.com/xiqiuqiu/xiaotuanbao.git /mnt/mydata/xiaotuanbao
cd /mnt/mydata/xiaotuanbao
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
- 按需改 `SEED_*`（空库首次起来后：`docker compose ... exec api ./node_modules/.bin/prisma db seed`）

不要把 `.env` 提交进 Git。

### 3. 登录 GHCR（私有包时）

在 **Mac**（手动传镜像）或服务器上执行一次：

```bash
# 使用仅有 read:packages 的 PAT
echo "$GHCR_PAT" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

若将 `xiaotuanbao-api` / `xiaotuanbao-web` 设为 public，可跳过。

### 4. Cloudflare Tunnel

在 Zero Trust → Networks → Tunnels 中，为现有 tunnel 增加 Public Hostname：

- Service：`http://127.0.0.1:8088`

服务器上已有 `cloudflared` 时，一般只需改控制台路由，不必重装。

### 5. 基础镜像

compose 需要精确标签 **`postgres:16`**、**`caddy:2`**（`postgres:16-alpine` 不能代替）。家用机拉 Docker Hub 慢时，可在 Mac 上 `docker save` 后 scp 到服务器 `docker load`。

国内镜像站注意：`ghcr.nju.edu.cn` 只代理 GHCR；Docker Hub 用 `docker.nju.edu.cn/library/...`，再 `docker tag` 回官方名。

## 日常发版

### 1. CI 构建推送

任选其一：

- GitHub → Actions → **Build Home Images** → Run workflow，填写 `image_tag`（如 `main`、`v0.1.0`）
- 或打 tag：`git tag v0.1.0 && git push origin v0.1.0`（同样只构建推送，不部署）

成功后镜像在 GHCR：

- `ghcr.io/xiqiuqiu/xiaotuanbao-api:<tag>`
- `ghcr.io/xiqiuqiu/xiaotuanbao-web:<tag>`
- `v*` 还会打 `latest`

推送 GHCR 使用 workflow 内置 `GITHUB_TOKEN`（已声明 `packages: write`）。无需配置 Tailscale OAuth / `DEPLOY_HOST`。

### 2. 手动部署到家用机

**路径 A — 服务器能较快拉 GHCR：**

```bash
cd /mnt/mydata/xiaotuanbao
git fetch --tags && git checkout main   # 或与 IMAGE_TAG 一致的 ref
IMAGE_TAG=main ./scripts/remote-deploy-home.sh
```

**路径 B — 慢网：Mac 拉好再传（推荐）：**

```bash
# Mac
TAG=main
docker pull --platform linux/arm64 ghcr.io/xiqiuqiu/xiaotuanbao-api:$TAG
docker pull --platform linux/arm64 ghcr.io/xiqiuqiu/xiaotuanbao-web:$TAG
docker save \
  ghcr.io/xiqiuqiu/xiaotuanbao-api:$TAG \
  ghcr.io/xiqiuqiu/xiaotuanbao-web:$TAG | gzip > /tmp/xiaotuanbao-images.tar.gz
scp /tmp/xiaotuanbao-images.tar.gz root@armbian:/mnt/mydata/

# 服务器
gunzip -c /mnt/mydata/xiaotuanbao-images.tar.gz | docker load
cd /mnt/mydata/xiaotuanbao
git fetch && git checkout "$TAG"   # 或 main，保证 compose 一致
IMAGE_TAG=$TAG docker compose -f docker-compose.yml -f docker-compose.home.yml up -d --pull never
curl -fsS http://127.0.0.1:8088/api/health
```

日常升版一般**不要**再跑 seed；空库首次才需要 seed。

## 本地验证 compose 覆盖

```bash
docker compose -f docker-compose.yml -f docker-compose.home.yml config
```

应看到 `api`/`web` 为 `ghcr.io/...` 镜像、无 `build`，且 Caddy 端口为 `127.0.0.1:8088:80`。

本地日常开发仍用原来的 `pnpm docker:up`（不要加 `docker-compose.home.yml`）。

## 故障排查

| 现象 | 排查 |
| ---- | ---- |
| `docker pull` 401 | Mac/服务器 `docker login ghcr.io`；或把 Package 设为 public |
| `No such image: postgres:16` | 缺精确标签；不要用 `16-alpine` 冒充；可 Mac 传包 load |
| health 失败 | `docker compose -f docker-compose.yml -f docker-compose.home.yml logs api caddy` |
| 页面通但登录 401 | 空库未 seed；`exec api ./node_modules/.bin/prisma db seed` |
| 本机域名 NXDOMAIN、服务器 health 正常 | Tailscale DNS 负缓存；与部署无关 |
| 端口冲突 | 确认只有 home overlay 映射 8088 |
| 内存紧张 | 部署窗口少跑重容器；不在机上 build |

## 相关文档

- [Docker 部署指南](./docker-deploy.md)
- [环境变量说明](./environment-variables.md)
- [运维操作手册](./operations.md)
- [Caddy 配置说明](./caddy.md)

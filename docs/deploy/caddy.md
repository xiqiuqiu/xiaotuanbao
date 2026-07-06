# Caddy 配置说明

配置文件：`docker/caddy/Caddyfile`

## 当前配置

```caddyfile
{$DOMAIN} {
    root * /srv/web
    encode gzip zstd

    handle /api/* {
        reverse_proxy api:3000
    }

    handle {
        try_files {path} /index.html
        file_server
    }
}
```

## 行为说明

| 规则 | 作用 |
| ---- | ---- |
| `{$DOMAIN}` | 站点地址，由环境变量 `CADDY_DOMAIN` 注入 |
| `root * /srv/web` | 前端静态资源目录（web_dist volume） |
| `handle /api/*` | API 请求反向代理到 `api:3000` |
| `try_files {path} /index.html` | SPA 路由刷新回退 |
| `encode gzip zstd` | 响应压缩 |

## 环境变量

在 `docker-compose.yml` 中：

```yaml
environment:
  DOMAIN: ${CADDY_DOMAIN:-:80}
```

| CADDY_DOMAIN 值 | 效果 |
| --------------- | ---- |
| `:80` | 本地 HTTP，监听 80 端口，无 TLS |
| `your-domain.com` | 生产 HTTPS，Caddy 自动申请证书 |

## 注意事项

1. **不要用 `localhost` 作为 CADDY_DOMAIN** — Caddy 会尝试为 localhost 配置 TLS 并 HTTP→HTTPS 重定向，导致 `curl http://localhost/api/health` 返回 308。
2. 生产环境确保域名 DNS 已指向服务器，且 80/443 端口可访问。
3. 修改 Caddyfile 后重启：`docker compose restart caddy`

## 证书持久化

Caddy 证书数据保存在 Docker volume：

- `caddy_data` — 证书文件
- `caddy_config` — 配置缓存

容器重建不会丢失证书。

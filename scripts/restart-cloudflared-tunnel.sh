#!/usr/bin/env bash
set -euo pipefail

# 重启系统级 Cloudflare 命名 tunnel（需 sudo）
# 用法: sudo ./scripts/restart-cloudflared-tunnel.sh

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "请使用 sudo 运行: sudo $0" >&2
  exit 1
fi

launchctl kickstart -k system/com.cloudflare.cloudflared
sleep 5

echo "=== cloudflared 最近日志 ==="
tail -10 /Library/Logs/com.cloudflare.cloudflared.err.log

if tail -5 /Library/Logs/com.cloudflare.cloudflared.err.log | grep -q 'Registered tunnel connection'; then
  echo "Tunnel 已成功连接 Cloudflare"
else
  echo "Tunnel 仍未连接，请检查 Clash fake-ip 配置是否已生效"
fi

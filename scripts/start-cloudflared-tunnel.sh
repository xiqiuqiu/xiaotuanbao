#!/usr/bin/env bash
set -euo pipefail

# 用户态启动 Cloudflare 命名 tunnel（读取系统 LaunchDaemon 中的 token）
# 用法: ./scripts/start-cloudflared-tunnel.sh

PLIST="/Library/LaunchDaemons/com.cloudflare.cloudflared.plist"

if [[ ! -f "$PLIST" ]]; then
  echo "未找到 $PLIST" >&2
  exit 1
fi

TOKEN=$(/usr/libexec/PlistBuddy -c 'Print :ProgramArguments:5' "$PLIST")

echo "正在启动命名 tunnel（HTTP/2 协议）..."
exec cloudflared tunnel run --token "$TOKEN" --protocol http2

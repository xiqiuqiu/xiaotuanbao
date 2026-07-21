#!/usr/bin/env bash
#
# 权限矩阵守卫（本地聚焦门禁）
#
# 背景：apps/api 的路由/权限面由 test/permission-matrix.e2e-spec.ts 固化成 golden 快照。
# 新增或改动端点后若忘记同步快照，该 e2e 会失败；而一旦坏快照进了 main，
# 之后每次提交都会继承并持续飘红（历史上 GET /api/source-orders、
# GET /api/account-generation-gaps 都踩过这个坑）。
#
# 本脚本只在「变更涉及路由/权限面」时触发，运行聚焦的单 spec（约数秒），
# 与 AGENTS.md「不默认本地跑全量 e2e」一致。数据库不可达时只告警不拦截。
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# 计算变更范围：优先对比 origin/main 的 merge-base，回退到 HEAD 的上一提交。
base=""
if git rev-parse --verify -q origin/main >/dev/null 2>&1; then
  base="$(git merge-base HEAD origin/main 2>/dev/null || true)"
fi
if [ -z "$base" ]; then
  base="$(git rev-parse -q --verify HEAD~1 2>/dev/null || true)"
fi

if [ -n "$base" ]; then
  changed="$({ git diff --name-only "$base...HEAD"; git diff --name-only; git diff --name-only --cached; } 2>/dev/null)"
else
  changed="$(git ls-files 'apps/api/src')"
fi

# 触发条件：任何可能改变路由/权限面的后端或能力清单文件。
route_touch="$(printf '%s\n' "$changed" | sort -u | grep -E \
  'apps/api/src/.*\.(controller|module)\.ts$|apps/api/src/.*(guard|permission|decorator).*\.ts$|packages/shared/src/.*(capabilit|permission|menu)' \
  || true)"

if [ -z "$route_touch" ]; then
  exit 0
fi

echo "[permission-matrix] 检测到可能影响路由/权限面的改动："
printf '  - %s\n' $route_touch

# permission-matrix e2e 会启动 AppModule（PrismaService.onModuleInit 需连库）。
# 从 .env 解析 DB host:port；不可达时只告警不拦截（e2e 最终由 CI 兜底）。
db_host="localhost"; db_port="5432"
url="$(grep -E '^DATABASE_URL=' .env 2>/dev/null | head -1 | cut -d= -f2- || true)"
if [[ "$url" =~ @([^:/]+):([0-9]+) ]]; then
  db_host="${BASH_REMATCH[1]}"; db_port="${BASH_REMATCH[2]}"
fi

if ! (exec 3<>"/dev/tcp/${db_host}/${db_port}") 2>/dev/null; then
  echo "[permission-matrix] ⚠ 数据库 ${db_host}:${db_port} 不可达，跳过本地校验。"
  echo "  若本次新增/改动了端点，请在 CI 前手动执行：pnpm gen:permission-matrix，检查 diff 后提交更新的快照。"
  exit 0
fi
exec 3>&- 2>/dev/null || true

echo "[permission-matrix] 运行聚焦快照校验（约数秒）……"
log="$(mktemp -t permission-matrix-check.XXXXXX.log)"
if ! pnpm --filter api test:permission-matrix >"$log" 2>&1; then
  echo "[permission-matrix] ✗ 权限矩阵快照与当前路由不一致（权限面变化未评审/未同步）。"
  echo "  如变化符合预期：运行 pnpm gen:permission-matrix，核对 diff 后连同快照一起提交。"
  echo "  完整日志：$log"
  exit 1
fi
echo "[permission-matrix] ✓ 快照与当前路由一致。"

#!/usr/bin/env bash
# Publish approved /to-tickets slices for Issue #237 as GitHub child issues.
# Requires: gh auth with repo issue write. Run from repo root.
set -euo pipefail

REPO="${REPO:-xiqiuqiu/xiaotuanbao}"
PARENT=237

create_issue() {
  local title="$1"
  local body="$2"
  gh issue create --repo "$REPO" \
    --title "$title" \
    --label "ready-for-agent,enhancement" \
    --body "$body" \
    | tee /dev/stderr \
    | sed -n 's#.*/issues/\([0-9][0-9]*\)$#\1#p'
}

echo "Creating tickets under #$PARENT ..."

T1=$(create_issue \
  "发团详情：顶栏 Tabs 替换左侧任务轨" \
  "$(cat <<EOF
## Parent

Part of #$PARENT

## What to build

发团详情用顶栏横向 Tabs（业务｜财务仅细分隔、无分组标题）切换概览/客源/执行/财务等页；\`?tab=\` 同步；小屏可换行。执行区内容可仍用现网旧布局。

## Acceptance criteria

- [ ] 详情页导航为顶栏 Tabs，不再使用左侧任务轨作为主入口
- [ ] 业务与财务 Tabs 之间仅细分隔，无「业务执行/财务处理」分组标题
- [ ] 切换 Tab 时 URL \`tab\` 同步，刷新落在同一页
- [ ] 既有 Tab 可见性/权限规则保持不变
- [ ] 有导航行为的回归测试

## Blocked by

None — can start immediately.
EOF
)")
echo "T1 -> #$T1"

T2=$(create_issue \
  "发团详情：执行区成本条 + 发团级资源折叠" \
  "$(cat <<EOF
## Parent

Part of #$PARENT

## What to build

执行安排自上而下为「整团成本条 → 发团级资源折叠（含汇总与批量生成应付）→ 行程段区 → 当日资源」。成本条可见发团级/按日拆分与尚未生成应付（金额 + N 项待生成）。本票行程段区可仍用现网纵向列表。

## Acceptance criteria

- [ ] 执行区顶部展示整团成本合计、发团级金额、按日金额
- [ ] 尚未生成应付展示金额，并显示「N 项待生成」或「已齐」
- [ ] 发团级资源在折叠区内，折叠头可见资源汇总口径
- [ ] 发团级支持对未生成项批量生成应付，并保留添加入口
- [ ] 折叠展开后仍为既有发团级资源表能力（生成/查看/作废应付全文）
- [ ] 有成本聚合与布局组成的外部行为测试

## Blocked by

None — can start immediately.
EOF
)")
echo "T2 -> #$T2"

T4=$(create_issue \
  "发团详情：页头执行班组展示收尾" \
  "$(cat <<EOF
## Parent

Part of #$PARENT

## What to build

发团详情页头：团基础信息一行；执行班组一行展示「司机 / 导游 / 车牌 / 电话」（不加「名称」）。电话在发团详情无正式字段前显示「-」。不新开班组 API。

## Acceptance criteria

- [ ] 页头可见司机、导游、车牌、电话四个班组字段
- [ ] 标签文案为「司机／导游／车牌／电话」，无「名称」后缀
- [ ] 电话无数据时显示「-」
- [ ] 页头信息层次清晰、无半宽灰盒大留白
- [ ] 有班组展示相关测试

## Blocked by

None — can start immediately.
EOF
)")
echo "T4 -> #$T4"

T3=$(create_issue \
  "发团详情：横向日程轴替换纵向行程段列表" \
  "$(cat <<EOF
## Parent

Part of #$PARENT

## What to build

按日资源用横向日程卡选天（资源项数、生成进度、待检查、增删天）；选中天后下方仍是当日资源表与汇总/批量生成/添加；\`?segmentId=\` 行为与现网一致。

## Acceptance criteria

- [ ] 纵向行程段列表替换为横向日程轴
- [ ] 日程卡展示日期、行程段名称、资源项数；有缺口时展示生成进度；待检查时打标
- [ ] 选中某天后下方只显示该日资源表，汇总口径与现网资源头一致
- [ ] 支持添加一天 / 删除一天（有资源时确认）
- [ ] URL \`segmentId\` 与选中态同步，刷新可恢复
- [ ] 有选天与 URL 同步的回归测试

## Blocked by

- #$T2
EOF
)")
echo "T3 -> #$T3"

T5=$(create_issue \
  "发团详情：拆除布局原型挂载" \
  "$(cat <<EOF
## Parent

Part of #$PARENT

## What to build

生产发团详情不再依赖布局原型的 \`?variant=\`、PrototypeSwitcher 或独立沙盒路由（历史可保留文档指针指向 PR #236）。主站只保留方案 D 布局。

## Acceptance criteria

- [ ] 生产详情路径忽略或移除 \`variant\` 布局切换
- [ ] 移除或 DEV-only 隔离 PrototypeSwitcher / 独立原型路由，主站用户不可达
- [ ] 文档或 PRD 保留原型 primary source 指针即可，不把原型组件当生产依赖
- [ ] 类型检查/相关路由测试通过

## Blocked by

- #$T1
- #$T2
- #$T3
- #$T4
EOF
)")
echo "T5 -> #$T5"

# Best-effort native blocking edges (GitHub issue dependencies)
block() {
  local child="$1"
  local blocker="$2"
  local blocker_id
  blocker_id=$(gh api "repos/$REPO/issues/$blocker" --jq .id)
  if gh api --method POST "repos/$REPO/issues/$child/dependencies/blocked_by" -f "issue_id=$blocker_id" >/dev/null 2>&1; then
    echo "Linked #$child blocked_by #$blocker"
  else
    echo "WARN: native blocked_by not set for #$child <- #$blocker (body Blocked by still present)"
  fi
}

block "$T3" "$T2"
block "$T5" "$T1"
block "$T5" "$T2"
block "$T5" "$T3"
block "$T5" "$T4"

# Task list on parent
gh issue comment "$PARENT" --repo "$REPO" --body "$(cat <<EOF
## /to-tickets 已发布

- [ ] #$T1 顶栏 Tabs
- [ ] #$T2 成本条 + 发团级折叠
- [ ] #$T3 横向日程轴（blocked by #$T2）
- [ ] #$T4 页头班组
- [ ] #$T5 拆除原型（blocked by #$T1 #$T2 #$T3 #$T4）

可立即开工：#$T1、#$T2、#$T4
EOF
)"

echo
echo "Done."
echo "Frontier (no blockers): #$T1 #$T2 #$T4"
echo "Then: #$T3 -> #$T5"

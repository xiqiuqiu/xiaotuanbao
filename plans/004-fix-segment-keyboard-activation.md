# 004 — 分离行程段选择与编辑交互

- **Status**: DONE
- **Commit**: b77379c
- **Severity**: HIGH
- **Category**: Accessibility
- **Rule**: custom/nested-interactive-keyboard-handler
- **Estimated scope**: 3 files, about 90 lines including tests

## Problem

行程段卡片用带 `role="button"` 的外层 `div` 包住真实编辑 `Button`。鼠标点击编辑时已有 `stopPropagation`，但键盘在编辑按钮按 Enter/Space 会冒泡到外层 `onKeyDown`，同时执行选择与编辑；该结构也形成嵌套交互控件。

    // apps/web/src/features/departure/components/ExecutionTab.tsx:424 — current
    <div
      role="button"
      tabIndex={0}
      data-segment-id={segment.id}
      className={`${styles.segmentItem}${selected ? ` ${styles.segmentItemSelected}` : ''}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
    >
      {/* ... */}
      <Button
        type="text"
        size="small"
        className={styles.segmentItemEdit}
        icon={<EditOutlined />}
        aria-label={`编辑${segment.name}`}
        onClick={(event) => {
          event.stopPropagation()
          onEdit()
        }}
      />
    </div>

## Target

不靠事件阻断补丁；把选择面和编辑按钮改为同一非交互容器中的兄弟控件。浏览器原生 button 自带 Enter/Space 语义：

    // apps/web/src/features/departure/components/ExecutionTab.tsx — target structure
    <div
      data-segment-id={segment.id}
      className={`${styles.segmentItem}${selected ? ` ${styles.segmentItemSelected}` : ''}`}
    >
      <button
        type="button"
        className={styles.segmentItemSelect}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <div className={styles.segmentItemHeader}>
          <div className={styles.segmentItemTitle}>
            <span>{segment.name}</span>
          </div>
        </div>
        {meta ? <span className={styles.segmentItemMeta}>{meta}</span> : null}
        <div className={styles.segmentItemOverviewRow}>
          {/* 保留现有 overview 与 payable gap 内容 */}
        </div>
      </button>
      {showEdit ? (
        <Button
          type="text"
          size="small"
          className={styles.segmentItemEdit}
          icon={<EditOutlined />}
          aria-label={`编辑${segment.name}`}
          onClick={onEdit}
        />
      ) : null}
    </div>

CSS 精确拆分职责：`.segmentItem` 保留 `position: relative`、边框、背景和选中态；新增 `.segmentItemSelect` 承担无默认外观的全宽点击面；编辑按钮绝对定位，避免覆盖标题文本。

    /* apps/web/src/features/departure/components/ExecutionTab.module.css — target core */
    .segmentItem {
      position: relative;
      width: 100%;
      border: 1px solid var(--execution-item-border);
      border-radius: var(--execution-radius);
      background: var(--execution-item-bg);
      transition: background-color 100ms ease, border-color 100ms ease, transform 100ms cubic-bezier(0.23, 1, 0.32, 1);
    }

    .segmentItemSelect {
      display: block;
      width: 100%;
      margin: 0;
      padding: 12px;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
      border: 0;
      border-radius: inherit;
      background: transparent;
    }

    .segmentItemEdit {
      position: absolute;
      top: 8px;
      right: 4px;
      opacity: 0.45;
      transition: opacity 100ms ease;
    }

标题区域为编辑按钮保留右侧空间（例如 `.segmentItemTitle { padding-inline-end: 28px; }`）。将原 `.segmentItem:active` 改为 `.segmentItem:has(.segmentItemSelect:active)`，focus-visible 用 `outline: 2px solid var(--execution-primary-border); outline-offset: 2px` 落在 `.segmentItemSelect`；保留 reduced-motion 和 hover/selected 行为。

## Repo conventions to follow

- `ExecutionTab.module.css:82` 的 token、100ms transition 与 reduced-motion 是必须保留的视觉约定。
- `ExecutionTab.layout.test.tsx:91` 是该组件的 ConfigProvider/QueryClient 测试装配范例。
- 使用原生 `button type="button"`，不手写 `role`/`tabIndex`/Enter-Space 键盘模拟。

## Steps

1. 在 `SegmentNavItem` 中按 Target 将选择 button 与编辑 Button 变为兄弟，删除外层 `role`、`tabIndex`、选择 `onKeyDown` 和编辑的 `stopPropagation`。
2. 在 `ExecutionTab.module.css` 拆分容器/选择面样式，补 focus-visible，并验证编辑按钮不遮住长标题、hover/selected/reduced-motion 不退化。
3. 在 `ExecutionTab.layout.test.tsx` 增加 `userEvent` 测试：Tab 聚焦选择面后 Enter 只调用选择；Tab 到编辑按钮后 Enter 只打开编辑；DOM 中不存在 `[role="button"] button` 或 `button button`。
4. 用现有 `segment-1` fixture 验证鼠标点击卡片仍选择、点击编辑仍只编辑。

## Boundaries

- 不修改 URL 同步、选中解析、编辑权限或 CRUD mutation。
- 不重构整个 `ExecutionTab`（组件拆分由计划 010 负责）。
- 不增加依赖，不改变卡片尺寸、颜色或信息层级。
- 若 `:has()` 与项目浏览器支持矩阵冲突，停止并报告；不要退回嵌套交互结构。
- 若代码偏离 commit `b77379c`，停止并报告 drift。

## Verification

- **Mechanical**:
  - `pnpm --filter @xiaotuanbao/web test -- ExecutionTab.layout`
  - `pnpm --filter @xiaotuanbao/web typecheck && pnpm --filter @xiaotuanbao/web lint`
  - `npx react-doctor@latest --scope changed` 清除目标诊断且分数不下降。
- **Behavior check**: 在发团详情“执行”页只用键盘依次聚焦行程段与编辑按钮；选择面 Enter/Space 只切换 segment，编辑按钮 Enter/Space 只打开编辑抽屉。用 DevTools Accessibility tree 确认二者是两个同级 button；用 Highlight updates 确认编辑动作不会先触发选中树更新。
- **Done when**: 无嵌套交互，键盘动作一键一义，现有视觉与鼠标行为不变，测试通过。

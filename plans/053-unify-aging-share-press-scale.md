# 053 — 统一账龄占比行按压为 scale(0.97)

- **Status**: TODO
- **Commit**: 03e5455
- **Severity**: LOW
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 CSS 文件；可选更新 cohesion 测试

## Problem

工作台按压反馈已统一为 `transform: scale(0.97)` + `100ms` + ease-out-quint（指标卡、队列、日条、全局 `.ant-btn`）。唯独账龄占比行用 `scale(0.99)`，手感偏「没按下去」，也与 `motion-cohesion.test.ts` 的「统一 scale(0.97)」目标不一致。

```388:390:apps/web/src/pages/HomePage.module.css
.agingShareRow:active {
  transform: scale(0.99);
}
```

对比同文件正确示例：

```326:329:apps/web/src/pages/HomePage.module.css
.metricButton:not(:disabled):active {
  background: var(--ant-color-primary-bg);
  transform: scale(0.97);
}
```

## Target

```css
/* HomePage.module.css — target */
.agingShareRow:active {
  transform: scale(0.97);
}
```

`prefers-reduced-motion` 块已包含 `.agingShareRow:active { transform: none; }`——**不要删**，无需改数值以外的 reduce 逻辑。

过渡已是：

```css
transition:
  border-color 100ms ease,
  transform 100ms var(--ant-motion-ease-out-quint, cubic-bezier(0.23, 1, 0.32, 1));
```

保持不变（AUDIT：按压 100–160ms；仓库锁定 100ms）。

## Repo conventions to follow

- `apps/web/src/styles/motion-cohesion.test.ts` 要求全局/登录/执行页按压为 `100ms` + `scale(0.97)`。
- 建议在该测试中**增加**对 `HomePage.module.css` 的断言：包含 `scale(0.97)` 且**不**含 `scale(0.99)`（与 executionCss「not scale(0.98)」同思路）。

Exemplar：

```31:46:apps/web/src/styles/motion-cohesion.test.ts
  it('unifies press feedback to 100ms scale(0.97)', () => {
    // ...
    expect(executionCss).toContain('transform: scale(0.97)')
    expect(executionCss).not.toContain('scale(0.98)')
```

## Steps

1. `HomePage.module.css`：将 `.agingShareRow:active` 的 `scale(0.99)` 改为 `scale(0.97)`。
2. 更新 `motion-cohesion.test.ts`：读取 `../pages/HomePage.module.css`，断言含 `scale(0.97)`、不含 `scale(0.99)`（可并入现有 `unifies press feedback` 用例或新开一条）。
3. 跑 cohesion + 财务账龄相关测试。

## Boundaries

- Do NOT 改其它控件的 scale。
- Do NOT 改 duration / easing / hover（050 管 hover media）。
- Do NOT 改 TSX。

## Verification

- **Mechanical**：
  - `pnpm --filter web exec vitest run src/styles/motion-cohesion.test.ts`
  - `pnpm --filter web typecheck`（可选）
- **Feel check**：
  - 财务工作台 → 结构占比：按下占比行，压缩量与指标卡/队列行一致（略明显于旧 0.99）。
  - 快速连点：过渡可中断、无 keyframes 重头播放。
  - `prefers-reduced-motion: reduce`：active 无 scale。
- **Done when**：源码无 `scale(0.99)`；cohesion 测试锁定 `0.97`；手感与其它工作台按压一致。

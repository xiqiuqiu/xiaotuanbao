# 012 — Soft opacity bridge for create-departure wizard steps

- **Status**: DONE
- **Commit**: c2e94ec
- **Severity**: LOW (missed opportunity)
- **Category**: Missed opportunities
- **Estimated scope**: 2–3 files (`CreateDepartureWizard.tsx` + `.module.css` + optional motion CSS test), small

## Problem

创建 / 复制发团向导在步骤间用条件渲染整块替换 workspace 内容。左侧 `Steps` 有进度反馈，右侧内容瞬切，缺少短桥接。该路径低频（Rare），适合加 **opacity-only** 理解性淡入——不要位移或庆祝动效。

```tsx
/* apps/web/src/features/departure/components/CreateDepartureWizard.tsx:189-202 — current */
<main className={styles.workspace}>
  {currentStep === 0 || showCopyBootstrap ? (
    <Form form={infoForm} className={styles.hiddenForm} aria-hidden />
  ) : null}
  {showCopyBootstrap ? (
    <div className={styles.loadingState}>
      <Spin description="正在加载源发团…" />
    </div>
  ) : !isCopyMode && currentStep === 0 ? (
    <CreateDepartureStepRoute values={routeValues} onChange={setRouteValues} />
  ) : (
    <CreateDepartureStepInfo form={infoForm} route={routeValues} />
  )}
</main>
```

相关触发：

- 普通模式：`下一步` / `上一步` → `currentStep` 0↔1，Route ↔ Info 硬切。
- 复制模式：`showCopyBootstrap` 结束后进入 Info，加载态 → 表单硬切。

页脚按钮区、Steps 轨本身**不**在本问题范围内。

## Target

- 当可见步骤内容挂载（含步骤切换与 bootstrap→表单）时：`opacity: 0 → 1`，**120ms**，缓动 **`ease`**（理解性 fade，与发团详情 Tab 桥接一致；不是位移入场）。
- **禁止** `translateY` / `translate`、`scale`、stagger、blur。
- 只动 `opacity`；动画 ≤120ms，不阻挡指针（`both` fill 可接受，因时长极短）。
- `prefers-reduced-motion: reduce`：`animation: none`（瞬时 `opacity: 1`）。
- 首次进入向导时步骤 0 也会淡入一次——低频可接受；不要为此加 session gate。

Suggested CSS（写入既有 `CreateDepartureWizard.module.css`，勿新建平行 token 文件）：

```css
.stepEnter {
  animation: wizard-step-fade 120ms ease both;
}

@keyframes wizard-step-fade {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .stepEnter {
    animation: none;
  }
}
```

Suggested wiring（保持 `hiddenForm` 在淡入包装**之外**，避免无关 remount）：

```tsx
<main className={styles.workspace}>
  {currentStep === 0 || showCopyBootstrap ? (
    <Form form={infoForm} className={styles.hiddenForm} aria-hidden />
  ) : null}
  <div key={stepEnterKey} className={styles.stepEnter}>
    {showCopyBootstrap ? (
      <div className={styles.loadingState}>
        <Spin description="正在加载源发团…" />
      </div>
    ) : !isCopyMode && currentStep === 0 ? (
      <CreateDepartureStepRoute values={routeValues} onChange={setRouteValues} />
    ) : (
      <CreateDepartureStepInfo form={infoForm} route={routeValues} />
    )}
  </div>
</main>
```

`stepEnterKey` 必须在内容身份变化时改变，以便 remount 重跑入场动画。建议：

```ts
const stepEnterKey = showCopyBootstrap
  ? 'bootstrap'
  : !isCopyMode && currentStep === 0
    ? 'route'
    : 'info'
```

可内联在 JSX `key={...}`，或提成同文件内的局部常量；**不要**抽共享 motion 工具库。

## Repo conventions to follow

- Personality：清晰运营台 — 克制、短、仅 opacity。
- **Exemplar（照抄配方，改名即可）**：`apps/web/src/features/departure/pages/DepartureDetailPage.module.css` 的 `.tabPaneEnter` + `tab-pane-fade 120ms ease both`，以及 `DepartureDetailPage.tsx` 的 `wrapTabPane`。
- 第二参照：`ExecutionTab.module.css` 的 `.resourcePaneEnter`（`100ms ease`）——本计划用 **120ms** 对齐 Tab 桥，不用 100ms。
- `DESIGN.md`：不新增平行 CSS Token 系统；缓动字面量用 `ease`（与 008/009 一致），**不要**为此引入 `cubic-bezier` 或 `--ease-*` 自定义属性。
- 机械锁：可新增 `CreateDepartureWizard.motion-css.test.ts`，模式照 `DepartureDetailPage.motion-css.test.ts`（读 CSS 文件断言 duration / 无 translate|scale / reduced-motion）。

## Steps

1. 打开 `apps/web/src/features/departure/components/CreateDepartureWizard.module.css`，在文件末尾（现有 media query 块之外或合理位置）追加 `.stepEnter`、`@keyframes wizard-step-fade`、`prefers-reduced-motion` 规则，数值与 Target 完全一致。
2. 编辑 `CreateDepartureWizard.tsx`：在 `<main className={styles.workspace}>` 内，用带 `key={stepEnterKey}` 与 `className={styles.stepEnter}` 的 `div` 包裹 bootstrap / Route / Info 三分支；**保留** `hiddenForm` 在该 `div` 外；footer / Steps 不动。
3. 新增 `apps/web/src/features/departure/components/CreateDepartureWizard.motion-css.test.ts`（或等价断言），至少覆盖：
   - `.stepEnter` 使用 `wizard-step-fade 120ms ease both`
   - keyframes 含 `opacity: 0`，且该 CSS 文件的 stepEnter 相关规则**不含** `translate` / `scale`
   - `prefers-reduced-motion` 下 `.stepEnter { animation: none }`
4. 跑既有 `CreateDepartureWizard.test.tsx`，确认复制模式 / 步骤 DOM 查询（如 `.wizardBody`）未被包装破坏；若 `closest` 仍找得到文案与 body class，无需改测试。若失败，只调整选择器，不删业务断言。

## Boundaries

- Do NOT 修改 `CreateDepartureStepRoute` / `CreateDepartureStepInfo` 内部样式或动效。
- Do NOT 给 Steps 轨、页头、footer 加动画。
- Do NOT 加 Framer Motion / `AnimatePresence` / 新依赖。
- Do NOT 用 `translateY`、`scale`、stagger、blur，或 duration > 120ms。
- Do NOT 改登录页、发团详情 Tab、执行资源面板、伙伴往来 Segmented（那是别的机会，不在本 plan）。
- Do NOT 新增全局 CSS 或 design token 文件。
- 若打开文件时结构已与 commit `c2e94ec` 漂移（例如步骤已有 fade），STOP 并报告，勿即兴改配方。

## Verification

- **Mechanical**:
  - `pnpm --filter web exec vitest run src/features/departure/components/CreateDepartureWizard.motion-css.test.ts src/features/departure/components/CreateDepartureWizard.test.tsx`（或仓库等价 web 测试命令）通过。
  - 类型检查不因本次改动失败。
- **Feel check**:
  - 打开「新建发团」：步骤 0 内容可有一次 ≤120ms 软淡入；立即点击可选控件，无「等动画结束才能点」的感觉。
  - 选好路线 → 下一步：Route → Info 软淡入，无上浮/缩放。
  - 上一步：Info → Route 同样淡入。
  - 复制发团：bootstrap Spin 结束后 Info 淡入一次。
  - DevTools Animations：playback 10%，确认只动 opacity，时长约 120ms，缓动为 ease。
  - Rendering → `prefers-reduced-motion: reduce`：无淡入，内容瞬时完整可见。
- **Done when**: 步骤切换不再硬切；CSS/测试锁定 opacity-only 120ms ease；reduced-motion 关闭动画；无新依赖、无位移。

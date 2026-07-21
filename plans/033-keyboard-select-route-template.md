# 033 — 建团路线模板卡片支持键盘选择

- **Status**: DONE
- **Commit**: 9477cf7
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Rule**: Beyond the scan（no-static-element-interactions / click-events-have-key-events）
- **Estimated scope**: 1–2 文件（`CreateDepartureStepRoute.tsx` + 可选测试）

## Problem

选择常用路线时用 `Card` 的 `onClick`，底层是静态容器，键盘无法激活；内嵌 `Checkbox` 有 `aria-label` 但无 `onChange`，与卡片点击/删除按钮叠成混乱交互。

```184:209:apps/web/src/features/departure/components/CreateDepartureStepRoute.tsx
                    <Card
                      hoverable
                      className={styles.templateCard}
                      styles={{ body: { padding: 16 } }}
                      onClick={() => handleSelectTemplate(template)}
                      style={{
                        borderColor: selected ? token.colorPrimary : undefined,
                        background: selected ? token.colorPrimaryBg : undefined,
                      }}
                    >
                      <div className={styles.templateCardHeader}>
                        <div className={styles.templateTitle}>
                          <Checkbox checked={selected} aria-label={`选择路线 ${template.name}`} />
                          <Typography.Text strong>{template.name}</Typography.Text>
                        </div>
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          aria-label={`删除常用路线 ${template.name}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            handleDeleteTemplate(template)
                          }}
                        />
```

Exemplar：计划 004（行程段键盘激活）——可聚焦控件 + Enter/Space。

## Target

推荐方案（改动小、语义清）：让 **Checkbox** 承担选择，卡片不再是唯一点击目标；或把整卡换成 `role="button"` + `tabIndex={0}` + `onKeyDown`。

**方案 A（优先）—— Checkbox 驱动：**

```tsx
<Card
  hoverable
  className={styles.templateCard}
  styles={{ body: { padding: 16 } }}
  // 保留点击选中以兼容鼠标大面积点选
  onClick={() => handleSelectTemplate(template)}
  onKeyDown={(event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleSelectTemplate(template)
    }
  }}
  tabIndex={0}
  role="button"
  aria-pressed={selected}
  aria-label={`选择路线 ${template.name}`}
  ...
>
  <Checkbox
    checked={selected}
    aria-label={`选择路线 ${template.name}`}
    onChange={() => handleSelectTemplate(template)}
    onClick={(event) => event.stopPropagation()}
  />
  ...
</Card>
```

确保删除按钮 `stopPropagation` 保留。焦点环勿被 CSS 去掉（遵守 `no-outline-none`）。

## Repo conventions to follow

- 已有 `aria-label={`选择路线 ${template.name}`}` 文案复用。
- antd `Card`/`Checkbox`；不要引入新依赖。

## Steps

1. 按方案 A 补齐键盘与 Checkbox `onChange`。
2. 手动 Tab → Enter/Space 选中；删除仍只删不选错。
3. 若有 CreateDeparture 相关测试，补一条键盘/checkbox 断言。

## Boundaries

- Do NOT 改模板数据结构或删除 API。
- Do NOT 用仅装饰性的 `div onClick` 无键盘替代方案。

## Verification

- **Mechanical**: typecheck。
- **Behavior**: 键盘可聚焦卡片或 checkbox，Enter/Space 选中模板；点删除只触发删除确认。
- **Done when**: 键盘路径与鼠标路径均可完成选择。

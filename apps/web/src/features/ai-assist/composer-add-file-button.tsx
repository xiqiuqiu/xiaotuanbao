import { PlusOutlined } from '@ant-design/icons'
import type { ButtonHTMLAttributes } from 'react'

type ComposerAddFileButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  onAddFile?: () => void
  toolsMenu?: unknown
}

/**
 * CopilotKit 默认加号会弹出 Radix 菜单（Portal 到 body，z-50）。
 * 展开协作工作区是 z-index:1001 的层叠上下文，菜单会衬在后面点不到。
 * 这里直接打开文件选择，侧栏和工作区同一条路径。
 */
export function ComposerAddFileButton({
  onAddFile,
  disabled,
  toolsMenu: _toolsMenu,
  children,
  onClick: _ignoredOnClick,
  ...props
}: ComposerAddFileButtonProps) {
  return (
    <button
      type="button"
      data-testid="copilot-add-menu-button"
      aria-label="添加附件"
      {...props}
      disabled={disabled || !onAddFile}
      onClick={() => onAddFile?.()}
    >
      {children ?? <PlusOutlined aria-hidden />}
    </button>
  )
}

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useUiStore } from '@/app/store/ui.store'
import { AssistPane } from './AssistPane'
import { AssistPaneSlotProvider, useAssistPaneSlot } from './assist-pane-slot'

function SlotSetter({ text }: { text: string }) {
  const { setContent } = useAssistPaneSlot()
  useEffect(() => {
    setContent(<p>{text}</p>)
    return () => setContent(null)
  }, [setContent, text])
  return null
}

describe('AssistPane', () => {
  beforeEach(() => {
    useUiStore.setState({ assistPaneCollapsed: true })
  })
  afterEach(() => cleanup())

  it('is omitted when collapsed so the main column keeps full width', () => {
    render(
      <AssistPaneSlotProvider>
        <main>发团表单</main>
        <AssistPane />
      </AssistPaneSlotProvider>,
    )
    expect(screen.getByText('发团表单')).toBeVisible()
    expect(screen.queryByRole('complementary', { name: '电子化助理' })).not.toBeInTheDocument()
  })

  it('closes from its own header without masking the main content', async () => {
    const user = userEvent.setup()
    useUiStore.setState({ assistPaneCollapsed: false })
    render(
      <AssistPaneSlotProvider>
        <main>发团表单</main>
        <AssistPane />
      </AssistPaneSlotProvider>,
    )
    expect(screen.getByText('发团表单')).toBeVisible()
    expect(screen.getByText('当前页尚未接入业务辅助')).toBeInTheDocument()
    expect(document.querySelector('[aria-label="关闭侧边栏"]')).toBeNull()
    await user.click(screen.getByRole('button', { name: '收起电子化助理' }))
    expect(screen.queryByRole('complementary', { name: '电子化助理' })).not.toBeInTheDocument()
    expect(useUiStore.getState().assistPaneCollapsed).toBe(true)
  })

  it('renders the registered page slot instead of the placeholder', () => {
    useUiStore.setState({ assistPaneCollapsed: false })
    render(
      <AssistPaneSlotProvider>
        <SlotSetter text="建团协助" />
        <AssistPane />
      </AssistPaneSlotProvider>,
    )
    expect(screen.getByText('建团协助')).toBeInTheDocument()
    expect(screen.queryByText('当前页尚未接入业务辅助')).not.toBeInTheDocument()
  })

  it('throws when useAssistPaneSlot is used outside AssistPaneSlotProvider', () => {
    function Probe() {
      useAssistPaneSlot()
      return null
    }

    expect(() => render(<Probe />)).toThrow(/AssistPaneSlotProvider/)
  })
})

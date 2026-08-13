import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from 'react'

interface AssistPaneSlotValue {
  content: ReactNode | null
  setContent: (content: ReactNode | null) => void
}

const AssistPaneSlotContext = createContext<AssistPaneSlotValue | null>(null)

export function AssistPaneSlotProvider({ children }: PropsWithChildren) {
  const [content, setContent] = useState<ReactNode | null>(null)
  const value = useMemo(() => ({ content, setContent }), [content])

  return (
    <AssistPaneSlotContext.Provider value={value}>
      {children}
    </AssistPaneSlotContext.Provider>
  )
}

export function useAssistPaneSlot() {
  const slot = useContext(AssistPaneSlotContext)
  if (!slot) {
    throw new Error('useAssistPaneSlot must be used within AssistPaneSlotProvider')
  }
  return slot
}

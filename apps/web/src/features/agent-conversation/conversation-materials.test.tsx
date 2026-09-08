import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConversationMaterialsTrigger, ConversationUserMessage } from './conversation-materials'
import { listDepartureMaterials, previewDepartureMaterial } from '@/services/ai-create-task.service'
import { useAgentConversationStore } from './agent-conversation.store'
import { useAgentConversationRuntimeStore } from './agent-conversation-runtime.store'
vi.mock('@copilotkit/react-core/v2', () => ({
  CopilotChatUserMessage: ({ message }: { message: { content: string } }) => <p>{message.content}</p>,
  CopilotChatAttachmentRenderer: ({ source }: { source: { value: string } }) => <img src={source.value} alt="Image attachment" />,
}))
vi.mock('@/services/ai-create-task.service', () => ({ listDepartureMaterials: vi.fn(), previewDepartureMaterial: vi.fn() }))
const file = { id: 'source-1', originalFilename: '名单.png', contentType: 'image/png', userMessageSequences: [3], status: 'available' }
function mount(sequence = 3) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ConversationMaterialsTrigger />
    <ConversationUserMessage message={{ id: `event-${sequence}`, role: 'user', content: '读取附件' }} />
  </QueryClientProvider>)
}
describe('persisted conversation attachments', () => {
  beforeEach(() => {
    useAgentConversationStore.setState({ conversationId: 'chat-1' })
    useAgentConversationRuntimeStore.getState().clear()
    vi.mocked(listDepartureMaterials).mockResolvedValue([file] as never)
    vi.mocked(previewDepartureMaterial).mockResolvedValue({ blob: new Blob(['image']), filename: file.originalFilename })
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() }))
  })
  afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })
  it('restores an image from persisted source links after mounting and releases its URL', async () => {
    const ui = mount()
    expect(await screen.findByRole('img', { name: 'Image attachment' })).toHaveAttribute('src', 'blob:preview')
    expect(previewDepartureMaterial).toHaveBeenCalledWith('chat-1', 'source-1')
    expect(screen.getByRole('button', { name: '会话资料' })).toBeInTheDocument()
    ui.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
    mount()
    expect(await screen.findByRole('img', { name: 'Image attachment' })).toBeInTheDocument()
  })
  it('does not attach an image to another message with the same filename', async () => {
    mount(4)
    await waitFor(() => expect(listDepartureMaterials).toHaveBeenCalled())
    expect(screen.queryByRole('img', { name: 'Image attachment' })).toBeNull()
    expect(previewDepartureMaterial).not.toHaveBeenCalled()
  })
  it('opens a PDF through the authenticated preview endpoint on demand', async () => {
    vi.mocked(listDepartureMaterials).mockResolvedValue([{ ...file, originalFilename: '行程.pdf', contentType: 'application/pdf' }] as never)
    mount()
    await userEvent.click(await screen.findByRole('button', { name: '行程.pdf' }))
    await waitFor(() => expect(document.querySelector('object')).toHaveAttribute('data', 'blob:preview'))
    expect(previewDepartureMaterial).toHaveBeenCalledWith('chat-1', 'source-1')
  })
})

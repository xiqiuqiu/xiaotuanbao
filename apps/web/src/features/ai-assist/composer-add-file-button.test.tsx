import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { ComposerAddFileButton } from './composer-add-file-button'

afterEach(cleanup)

it('opens the file picker on the first click without a portaled menu', async () => {
  const user = userEvent.setup()
  const onAddFile = vi.fn()
  render(<ComposerAddFileButton onAddFile={onAddFile} />)

  await user.click(screen.getByRole('button', { name: '添加附件' }))
  expect(onAddFile).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('menu')).toBeNull()
})

it('stays disabled when CopilotKit has not bound onAddFile', () => {
  render(<ComposerAddFileButton />)
  expect(screen.getByRole('button', { name: '添加附件' })).toBeDisabled()
})

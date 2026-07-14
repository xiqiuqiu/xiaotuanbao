import { Form } from 'antd'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EmployeeFormDrawer } from './EmployeeFormDrawer'
import type { UpdateEmployeePayload } from '@/services/employee.service'

function RenderDrawer({ editing }: { editing: boolean }) {
  const [form] = Form.useForm()
  return (
    <EmployeeFormDrawer
      open
      editing={editing}
      loading={false}
      form={form}
      roleOptions={[{ label: '企业管理员', value: 'role-1' }]}
      onClose={() => undefined}
      onSubmit={() => undefined}
    />
  )
}

afterEach(() => {
  cleanup()
})

describe('EmployeeFormDrawer login username', () => {
  it('create mode shows login username', () => {
    render(<RenderDrawer editing={false} />)
    const drawer = screen.getByRole('dialog')
    expect(within(drawer).getByLabelText('登录用户名')).toBeInTheDocument()
  })

  it('edit mode allows changing login username', () => {
    render(<RenderDrawer editing={true} />)
    const drawer = screen.getByRole('dialog')
    expect(within(drawer).getByLabelText('登录用户名')).toBeInTheDocument()
  })

  it('update API payload includes login username', () => {
    const payload = {
      username: 'mazong',
      name: '马总',
      roleId: 'role-1',
      status: 'enabled',
    } satisfies UpdateEmployeePayload
    expect(payload.username).toBe('mazong')
  })
})

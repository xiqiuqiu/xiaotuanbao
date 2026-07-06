import { useCallback, useMemo, useState } from 'react'
import { Button, Card, Form, Space, Table, Tag, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnsType } from 'antd/es/table'
import type { EmployeeSummary } from '@/types/api'
import { UserStatus } from '@xiaotuanbao/shared'
import {
  createEmployee,
  disableEmployee,
  listEmployees,
  updateEmployee,
} from '@/services/employee.service'
import { listRoles } from '@/services/role.service'
import { EmployeeFilters } from './employees/EmployeeFilters'
import { EmployeeFormDrawer, type EmployeeFormValues } from './employees/EmployeeFormDrawer'
import { EmployeeStatsCards } from './employees/EmployeeStatsCards'
import { formatLastLogin } from './employees/formatLastLogin'

function buildColumns(
  onEdit: (employee: EmployeeSummary) => void,
  onDisable: (employeeId: string) => void,
): ColumnsType<EmployeeSummary> {
  return [
    {
      title: '员工信息',
      dataIndex: 'name',
      render: (name: string) => <Typography.Text strong>{name}</Typography.Text>,
    },
    { title: '账号', dataIndex: 'username' },
    {
      title: '角色',
      dataIndex: 'roles',
      render: (roleNames: string[]) => roleNames.map((role) => <Tag key={role}>{role}</Tag>),
    },
    {
      title: '最近活跃',
      dataIndex: 'lastLoginAt',
      render: (value: string | null) => formatLastLogin(value),
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (status: UserStatus) => (
        <Tag color={status === UserStatus.ENABLED ? 'success' : 'default'}>
          {status === UserStatus.ENABLED ? '启用' : '停用'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button type="link" onClick={() => onEdit(record)}>
            编辑
          </Button>
          {record.status === UserStatus.ENABLED ? (
            <Button type="link" danger onClick={() => onDisable(record.id)}>
              停用
            </Button>
          ) : null}
        </Space>
      ),
    },
  ]
}

export function EmployeesPage() {
  const queryClient = useQueryClient()
  const [form] = Form.useForm<EmployeeFormValues>()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<EmployeeSummary | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<UserStatus | undefined>()
  const [roleFilter, setRoleFilter] = useState<string | undefined>()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: listRoles,
  })

  const {
    data: employeesResult,
    isLoading: employeesLoading,
  } = useQuery({
    queryKey: ['employees', search, statusFilter, roleFilter, page, pageSize],
    queryFn: () =>
      listEmployees({
        search: search || undefined,
        status: statusFilter,
        roleId: roleFilter,
        page,
        pageSize,
      }),
  })

  const roleOptions = useMemo(
    () => roles.map((role) => ({ label: role.name, value: role.id })),
    [roles],
  )

  const closeDrawer = () => {
    setDrawerOpen(false)
    setEditingEmployee(null)
    form.resetFields()
  }

  const openCreateDrawer = () => {
    setEditingEmployee(null)
    form.resetFields()
    form.setFieldsValue({ status: UserStatus.ENABLED })
    setDrawerOpen(true)
  }

  const openEditDrawer = useCallback(
    (employee: EmployeeSummary) => {
      setEditingEmployee(employee)
      form.setFieldsValue({
        name: employee.name,
        remark: employee.remark ?? undefined,
        roleId: roles.find((role) => role.name === employee.roles[0])?.id,
        status: employee.status as UserStatus,
      })
      setDrawerOpen(true)
    },
    [form, roles],
  )

  const saveMutation = useMutation({
    mutationFn: async (values: EmployeeFormValues) => {
      if (editingEmployee) {
        return updateEmployee(editingEmployee.id, {
          name: values.name,
          remark: values.remark,
          roleId: values.roleId,
          status: values.status,
        })
      }

      if (!values.username || !values.password) {
        throw new Error('请填写用户名和初始密码')
      }

      if (values.password !== values.confirmPassword) {
        throw new Error('两次输入的密码不一致')
      }

      return createEmployee({
        username: values.username,
        name: values.name,
        remark: values.remark,
        roleId: values.roleId,
        status: values.status,
        password: values.password,
      })
    },
    onSuccess: () => {
      message.success(editingEmployee ? '员工已更新' : '员工已创建')
      closeDrawer()
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '保存失败')
    },
  })

  const disableMutation = useMutation({
    mutationFn: disableEmployee,
    onSuccess: () => {
      message.success('员工已停用')
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
  })

  const handleDisable = useCallback(
    (employeeId: string) => {
      disableMutation.mutate(employeeId)
    },
    [disableMutation],
  )

  const columns = useMemo(
    () => buildColumns(openEditDrawer, handleDisable),
    [openEditDrawer, handleDisable],
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
            员工管理
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            管理员工账号、Role 与访问权限
          </Typography.Paragraph>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
          创建员工
        </Button>
      </div>

      <EmployeeStatsCards stats={employeesResult?.stats} />

      <EmployeeFilters
        statusFilter={statusFilter}
        roleFilter={roleFilter}
        roleOptions={roleOptions}
        onStatusChange={setStatusFilter}
        onRoleChange={setRoleFilter}
        onSearch={(value) => {
          setSearch(value)
          setPage(1)
        }}
      />

      <Card>
        <Table
          rowKey="id"
          loading={employeesLoading}
          columns={columns}
          dataSource={employeesResult?.items ?? []}
          pagination={{
            current: page,
            pageSize,
            total: employeesResult?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage)
              setPageSize(nextPageSize)
            },
          }}
        />
      </Card>

      <EmployeeFormDrawer
        open={drawerOpen}
        editing={Boolean(editingEmployee)}
        loading={saveMutation.isPending}
        form={form}
        roleOptions={roleOptions}
        onClose={closeDrawer}
        onSubmit={(values) => saveMutation.mutate(values)}
      />
    </div>
  )
}

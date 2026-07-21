import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, Form, Modal, Table, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { EmployeeSummary } from '@/types/api'
import { UserStatus } from '@xiaotuanbao/shared'
import {
  createEmployee,
  disableEmployee,
  listEmployees,
  updateEmployee,
} from '@/services/employee.service'
import { listRoles } from '@/services/role.service'
import { PageHeader } from '@/layouts/PageHeader'
import { EmployeeFilters } from './employees/EmployeeFilters'
import { EmployeeFormDrawer, type EmployeeFormValues } from './employees/EmployeeFormDrawer'
import { EmployeeStatsCards } from './employees/EmployeeStatsCards'
import { StaleDataAlert } from '@/components/StaleDataAlert'
import {
  listSoftFetchingClassName,
  resolveListTableLoading,
  useListPlaceholderData,
} from '@/lib/query/list-query-ux'
import { operationalQueryOptions } from '@/lib/query/stale-data-prompt'
import { buildEmployeeColumns } from './employees/employee-columns'

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

  const listFilterKey = [search, statusFilter, roleFilter].join('\0')
  const { placeholderData, commitListFilterKey } = useListPlaceholderData(listFilterKey)

  const {
    data: employeesResult,
    isLoading,
    isFetching,
    isError,
    isSuccess,
    isPlaceholderData,
    refetch,
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
    placeholderData,
    ...operationalQueryOptions(),
  })

  useEffect(() => {
    commitListFilterKey(isSuccess, isPlaceholderData)
  }, [commitListFilterKey, isSuccess, isPlaceholderData])

  const { hardLoading, softFetching } = resolveListTableLoading({
    isLoading,
    isFetching,
    isPlaceholderData,
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
      setEditingEmployee(() => employee)
      form.setFieldsValue({
        username: employee.username,
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
          username: values.username,
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
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '停用失败')
    },
  })

  const handleDisable = useCallback(
    (employee: EmployeeSummary) => {
      Modal.confirm({
        title: '确认停用员工？',
        content: `停用后「${employee.name}」将无法登录，可在编辑中重新启用。`,
        okText: '停用',
        okType: 'danger',
        cancelText: '取消',
        onOk: () => disableMutation.mutateAsync(employee.id),
      })
    },
    [disableMutation],
  )

  const columns = useMemo(
    () => buildEmployeeColumns(openEditDrawer, handleDisable),
    [openEditDrawer, handleDisable],
  )

  return (
    <div>
      <PageHeader
        title="员工管理"
        action={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
            创建员工
          </Button>
        }
      />

      <EmployeeStatsCards stats={employeesResult?.stats} />

      <EmployeeFilters
        statusFilter={statusFilter}
        roleFilter={roleFilter}
        roleOptions={roleOptions}
        onStatusChange={(value) => {
          setStatusFilter(() => value)
          setPage(1)
        }}
        onRoleChange={(value) => {
          setRoleFilter(() => value)
          setPage(1)
        }}
        onSearch={(value) => {
          setSearch(() => value)
          setPage(1)
        }}
      />

      <StaleDataAlert
        isFetching={isFetching}
        isError={isError}
        hasData={Boolean(employeesResult)}
        onRefresh={() => {
          void refetch()
        }}
      />

      <Card>
        <Table
          rowKey="id"
          loading={hardLoading}
          columns={columns}
          dataSource={employeesResult?.items ?? []}
          scroll={{ x: 1060 }}
          className={listSoftFetchingClassName(softFetching)}
          pagination={{
            current: page,
            pageSize,
            total: employeesResult?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (nextPage, nextPageSize) => {
              setPage(() => nextPage)
              setPageSize(() => nextPageSize)
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

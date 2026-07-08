import { useCallback, useMemo, useState } from 'react'
import { Button, Card, Form, Modal, Table, Tag, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnsType } from 'antd/es/table'
import { VerificationStatus, type FinanceVerificationSummary } from '@xiaotuanbao/shared'
import {
  cancelVerification,
  createVerification,
  listDepartureVerifications,
  listVerifications,
} from '@/services/finance.service'
import {
  VERIFICATION_STATUS_COLORS,
  VERIFICATION_STATUS_LABELS,
  catalogLabel,
  formatCents,
} from '../catalog'
import { VerificationFormDrawer } from './VerificationFormDrawer'
import {
  buildCreateVerificationPayload,
  type VerificationFormValues,
} from '../utils/verification-form'

export type VerificationsWorkspaceProps = {
  scope: 'global' | 'departure'
  departureId?: string
  readOnly?: boolean
}

export function VerificationsWorkspace({
  scope,
  departureId: lockedDepartureId,
  readOnly = false,
}: VerificationsWorkspaceProps) {
  const queryClient = useQueryClient()
  const [form] = Form.useForm<VerificationFormValues>()
  const [modalOpen, setModalOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const isDepartureScope = scope === 'departure'
  const listQueryKey = isDepartureScope ? 'departure-verifications' : 'finance-verifications'

  const { data: verificationsResult, isLoading } = useQuery({
    queryKey: [listQueryKey, lockedDepartureId, page, pageSize],
    queryFn: () => {
      if (isDepartureScope) {
        if (!lockedDepartureId) {
          throw new Error('发团 ID 缺失')
        }
        return listDepartureVerifications(lockedDepartureId, { page, pageSize })
      }
      return listVerifications({ page, pageSize })
    },
    enabled: !isDepartureScope || Boolean(lockedDepartureId),
  })

  const createMutation = useMutation({
    mutationFn: (values: VerificationFormValues) =>
      createVerification(buildCreateVerificationPayload(values)),
    onSuccess: () => {
      message.success('核销已创建')
      setModalOpen(false)
      form.resetFields()
      void queryClient.invalidateQueries({ queryKey: ['finance-verifications'] })
      void queryClient.invalidateQueries({ queryKey: ['departure-verifications'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-receivables'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-payables'] })
      void queryClient.invalidateQueries({ queryKey: ['departure-receivables'] })
      void queryClient.invalidateQueries({ queryKey: ['departure-payables'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '创建失败')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: cancelVerification,
    onSuccess: () => {
      message.success('核销已撤销')
      void queryClient.invalidateQueries({ queryKey: ['finance-verifications'] })
      void queryClient.invalidateQueries({ queryKey: ['departure-verifications'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-receivables'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-payables'] })
      void queryClient.invalidateQueries({ queryKey: ['departure-receivables'] })
      void queryClient.invalidateQueries({ queryKey: ['departure-payables'] })
      void queryClient.invalidateQueries({ queryKey: ['finance-transactions'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '撤销失败')
    },
  })

  const handleCancel = useCallback(
    (verification: FinanceVerificationSummary) => {
      Modal.confirm({
        title: '确认撤销核销？',
        content: `撤销后核销 ${verification.verificationNo} 将不再计入节点结清金额。`,
        okText: '撤销',
        okType: 'danger',
        cancelText: '取消',
        onOk: () => cancelMutation.mutateAsync(verification.id),
      })
    },
    [cancelMutation],
  )

  const columns = useMemo<ColumnsType<FinanceVerificationSummary>>(
    () => [
      {
        title: '核销号',
        dataIndex: 'verificationNo',
        render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
      },
      {
        title: '账款节点',
        dataIndex: 'paymentScheduleId',
        render: (value: string) => (
          <Typography.Text copyable={{ text: value }}>{value.slice(0, 8)}…</Typography.Text>
        ),
      },
      {
        title: '流水',
        dataIndex: 'transactionId',
        render: (value: string) => (
          <Typography.Text copyable={{ text: value }}>{value.slice(0, 8)}…</Typography.Text>
        ),
      },
      {
        title: '核销金额',
        dataIndex: 'amountCents',
        render: (value: number) => formatCents(value),
      },
      {
        title: '状态',
        dataIndex: 'status',
        render: (status: string) => (
          <Tag color={VERIFICATION_STATUS_COLORS[status]}>
            {catalogLabel(VERIFICATION_STATUS_LABELS, status)}
          </Tag>
        ),
      },
      {
        title: '创建时间',
        dataIndex: 'createdAt',
        render: (value: string) => new Date(value).toLocaleString('zh-CN'),
      },
      ...(readOnly
        ? []
        : [
            {
              title: '操作',
              key: 'actions',
              render: (_: unknown, record: FinanceVerificationSummary) =>
                record.status === VerificationStatus.CANCELLED ? (
                  '—'
                ) : (
                  <Button type="link" danger onClick={() => handleCancel(record)}>
                    撤销核销
                  </Button>
                ),
            },
          ]),
    ],
    [handleCancel, readOnly],
  )

  return (
    <div>
      {!readOnly ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields()
              setModalOpen(true)
            }}
          >
            新建核销
          </Button>
        </div>
      ) : null}

      <Card>
        <Table
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={verificationsResult?.items ?? []}
          pagination={{
            current: page,
            pageSize,
            total: verificationsResult?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage)
              setPageSize(nextPageSize)
            },
          }}
        />
      </Card>

      {!readOnly ? (
        <VerificationFormDrawer
          open={modalOpen}
          loading={createMutation.isPending}
          form={form}
          onClose={() => {
            setModalOpen(false)
            form.resetFields()
          }}
          onSubmit={(values) => createMutation.mutate(values)}
        />
      ) : null}
    </div>
  )
}

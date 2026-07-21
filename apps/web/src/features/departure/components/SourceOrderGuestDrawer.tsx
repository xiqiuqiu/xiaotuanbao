import {
  useCallback,
  useMemo,
  useState,
  type HTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from 'react'
import { PlusOutlined, TeamOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Typography,
  message,
  theme,
} from 'antd'
import type { TableProps } from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SourceOrderSummary, SourceOrderGuestSummary } from '@/types/api'
import {
  createSourceOrderGuest,
  deleteSourceOrderGuest,
  listSourceOrderGuests,
  updateSourceOrderGuest,
} from '@/services/source-order.service'
import { GUEST_GENDER_OPTIONS, GUEST_GENDER_LABELS, catalogLabel } from '../catalog'
import { EllipsisTooltipText } from '@/components/EllipsisTooltipText'
import {
  formatGuestCountContrast,
  guestFormFieldRules,
  type GuestFormFieldName,
} from '../utils/source-order-guest-form'

const DRAFT_ID = '__draft__'

interface SourceOrderGuestDrawerProps {
  open: boolean
  sourceOrder: SourceOrderSummary | null
  readOnly: boolean
  onClose: () => void
}

interface GuestFormValues {
  name: string
  phone?: string
  gender?: string
  notes?: string
}

type GuestRow = SourceOrderGuestSummary

type GuestColumn = NonNullable<TableProps<GuestRow>['columns']>[number] & {
  editable?: boolean
  dataIndex?: GuestFormFieldName
  inputType?: 'text' | 'select'
}

interface EditableCellProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  editing: boolean
  dataIndex: GuestFormFieldName
  title: ReactNode
  inputType: 'text' | 'select'
  record: GuestRow
  index: number
}

function EditableCell({
  editing,
  dataIndex,
  title: _title,
  inputType,
  record: _record,
  index: _index,
  children,
  ...restProps
}: PropsWithChildren<EditableCellProps>) {
  const inputNode =
    inputType === 'select' ? (
      <Select
        allowClear
        placeholder="请选择性别"
        options={[...GUEST_GENDER_OPTIONS]}
        style={{ width: '100%' }}
      />
    ) : (
      <Input
        placeholder={
          dataIndex === 'name'
            ? '请输入姓名'
            : dataIndex === 'phone'
              ? '请输入手机号'
              : dataIndex === 'notes'
                ? '请输入备注（选填）'
                : undefined
        }
      />
    )

  return (
    <td {...restProps}>
      {editing ? (
        <Form.Item
          name={dataIndex}
          style={{ margin: 0 }}
          rules={guestFormFieldRules[dataIndex]}
        >
          {inputNode}
        </Form.Item>
      ) : (
        children
      )}
    </td>
  )
}

function createDraftGuest(sourceOrderId: string): GuestRow {
  return {
    id: DRAFT_ID,
    sourceOrderId,
    name: '',
    phone: null,
    gender: '',
    notes: null,
    createdAt: '',
    updatedAt: '',
  }
}

export function SourceOrderGuestDrawer({
  open,
  sourceOrder,
  readOnly,
  onClose,
}: SourceOrderGuestDrawerProps) {
  if (!open || !sourceOrder) {
    return <Drawer open={open} onClose={onClose} />
  }

  return (
    <SourceOrderGuestDrawerPanel
      key={sourceOrder.id}
      open={open}
      sourceOrder={sourceOrder}
      readOnly={readOnly}
      onClose={onClose}
    />
  )
}

interface SourceOrderGuestDrawerPanelProps {
  open: boolean
  sourceOrder: SourceOrderSummary
  readOnly: boolean
  onClose: () => void
}

function SourceOrderGuestDrawerPanel({
  open,
  sourceOrder,
  readOnly,
  onClose,
}: SourceOrderGuestDrawerPanelProps) {
  const { token } = theme.useToken()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<GuestFormValues>()
  const [editingKey, setEditingKey] = useState('')
  const [draftGuest, setDraftGuest] = useState<GuestRow | null>(null)

  const sourceOrderId = sourceOrder.id

  const { data: guests = [], isLoading } = useQuery({
    queryKey: ['source-order-guests', sourceOrderId],
    queryFn: () => listSourceOrderGuests(sourceOrderId),
  })

  const dataSource: GuestRow[] = draftGuest ? [...guests, draftGuest] : guests
  const isBusy = editingKey !== ''

  const saveMutation = useMutation({
    mutationFn: async ({
      key,
      values,
    }: {
      key: string
      values: GuestFormValues
    }) => {
      if (key === DRAFT_ID) {
        return createSourceOrderGuest(sourceOrderId, values)
      }
      return updateSourceOrderGuest(sourceOrderId, key, values)
    },
    onSuccess: (_data, variables) => {
      message.success(variables.key === DRAFT_ID ? '客人已添加' : '客人已更新')
      setEditingKey('')
      setDraftGuest(null)
      form.resetFields()
      void queryClient.invalidateQueries({ queryKey: ['source-order-guests', sourceOrderId] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (guestId: string) => deleteSourceOrderGuest(sourceOrderId, guestId),
    onSuccess: () => {
      message.success('客人已删除')
      void queryClient.invalidateQueries({ queryKey: ['source-order-guests', sourceOrderId] })
    },
  })

  const startAdd = () => {
    if (isBusy) {
      return
    }
    const draft = createDraftGuest(sourceOrderId)
    setDraftGuest(draft)
    form.setFieldsValue({
      name: '',
      phone: undefined,
      gender: undefined,
      notes: undefined,
    })
    setEditingKey(DRAFT_ID)
  }

  const startEdit = useCallback(
    (record: GuestRow) => {
      form.setFieldsValue({
        name: record.name,
        phone: record.phone ?? undefined,
        gender: record.gender || undefined,
        notes: record.notes ?? undefined,
      })
      setEditingKey(record.id)
    },
    [form],
  )

  const cancelEdit = useCallback(() => {
    if (editingKey === DRAFT_ID) {
      setDraftGuest(null)
    }
    setEditingKey('')
    form.resetFields()
  }, [editingKey, form])

  const saveMutate = saveMutation.mutate
  const deleteMutate = deleteMutation.mutate

  const saveRow = useCallback(
    async (key: string) => {
      try {
        const values = await form.validateFields()
        saveMutate({ key, values })
      } catch {
        // validation errors are shown inline by Form.Item
      }
    },
    [form, saveMutate],
  )

  const deleteGuest = useCallback(
    (guestId: string) => {
      deleteMutate(guestId)
    },
    [deleteMutate],
  )

  const savePending = saveMutation.isPending
  const columns = useMemo(() => {
    const baseColumns: GuestColumn[] = [
      {
        title: '姓名',
        dataIndex: 'name',
        editable: true,
        inputType: 'text',
        width: '18%',
      },
      {
        title: '手机号',
        dataIndex: 'phone',
        editable: true,
        inputType: 'text',
        width: '20%',
        render: (value: string | null) => value ?? '-',
      },
      {
        title: '性别',
        dataIndex: 'gender',
        editable: true,
        inputType: 'select',
        width: '16%',
        render: (value: string) => catalogLabel(GUEST_GENDER_LABELS, value),
      },
      {
        title: '备注',
        dataIndex: 'notes',
        editable: true,
        inputType: 'text',
        ellipsis: { showTitle: false },
        render: (value: string | null) => <EllipsisTooltipText>{value}</EllipsisTooltipText>,
      },
    ]

    if (!readOnly) {
      baseColumns.push({
        title: '操作',
        key: 'actions',
        width: 140,
        render: (_value: unknown, record: GuestRow) => {
          const editing = record.id === editingKey
          if (editing) {
            return (
              <Space>
                <Typography.Link
                  onClick={() => void saveRow(record.id)}
                  disabled={savePending}
                >
                  保存
                </Typography.Link>
                <Typography.Link onClick={cancelEdit} disabled={savePending}>
                  取消
                </Typography.Link>
              </Space>
            )
          }

          return (
            <Space>
              <Typography.Link disabled={isBusy} onClick={() => startEdit(record)}>
                编辑
              </Typography.Link>
              {record.id !== DRAFT_ID ? (
                <Popconfirm
                  title="确认删除该客人？"
                  onConfirm={() => deleteGuest(record.id)}
                  disabled={isBusy}
                >
                  <Typography.Link type="danger" disabled={isBusy}>
                    删除
                  </Typography.Link>
                </Popconfirm>
              ) : null}
            </Space>
          )
        },
      })
    }

    return baseColumns.map((col) => {
      if (!col.editable || !col.dataIndex) {
        return col
      }
      return {
        ...col,
        onCell: (record: GuestRow) =>
          ({
            record,
            inputType: col.inputType ?? 'text',
            dataIndex: col.dataIndex,
            title: col.title,
            editing: record.id === editingKey,
          }) as HTMLAttributes<HTMLElement>,
      }
    })
  }, [cancelEdit, deleteGuest, editingKey, isBusy, readOnly, savePending, saveRow, startEdit])

  return (
    <Drawer
      title={
        <Space size={8} align="baseline" wrap>
          <Typography.Text strong style={{ fontSize: token.fontSizeLG }}>
            客人名单
          </Typography.Text>
          <Typography.Text type="secondary">{sourceOrder.displayName}</Typography.Text>
        </Space>
      }
      open={open}
      size={720}
      onClose={onClose}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        icon={<TeamOutlined />}
        title={formatGuestCountContrast(guests.length, sourceOrder.guestCount)}
        style={{ marginBottom: 16 }}
      />

      {!readOnly ? (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={startAdd}
          disabled={isBusy}
          style={{ marginBottom: 16 }}
        >
          添加
        </Button>
      ) : null}

      <Form form={form} component={false}>
        <Table<GuestRow>
          rowKey="id"
          loading={isLoading}
          components={{
            body: { cell: EditableCell },
          }}
          columns={columns}
          dataSource={dataSource}
          pagination={false}
          size="small"
          locale={{ emptyText: '暂无数据' }}
        />
      </Form>
    </Drawer>
  )
}

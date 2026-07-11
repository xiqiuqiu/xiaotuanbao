import { useCallback, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Dropdown,
  Form,
  Row,
  Space,
  Tag,
  Typography,
  message,
} from 'antd'
import type { MenuProps } from 'antd'
import { ArrowLeftOutlined, DownOutlined } from '@ant-design/icons'
import { Link } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { DepartureDetail } from '@/types/api'
import { DepartureStatus } from '@xiaotuanbao/shared'
import {
  closeDeparture,
  transitionDeparture,
  unarchiveDeparture,
} from '@/services/departure.service'
import {
  DEPARTURE_PROGRESS_COLORS,
  DEPARTURE_PROGRESS_LABELS,
  DEPARTURE_STATUS_COLORS,
  DEPARTURE_STATUS_LABELS,
  DEPARTURE_TYPE_LABELS,
  catalogLabel,
} from '../catalog'
import { departureToFormValues, type DepartureOverviewFormValues } from '../utils/departure-overview-form'
import type { DepartureTransitionAction } from '../utils/departure-transition'
import { DepartureArchiveHistory } from './DepartureArchiveHistory'
import { DepartureSettlementHistory } from './DepartureSettlementHistory'
import { DepartureOverviewDrawer } from './DepartureOverviewDrawer'
import { DepartureOperationsSheetDrawer } from './DepartureOperationsSheetDrawer'
import {
  DepartureTransitionModal,
  type CloseDepartureFormValues,
} from './DepartureTransitionModal'
import {
  DepartureUnarchiveModal,
  type UnarchiveDepartureFormValues,
} from './DepartureUnarchiveModal'
import { SaveAsRouteTemplateModal } from './SaveAsRouteTemplateModal'

interface DepartureHeaderProps {
  departure: DepartureDetail
  onUpdated: () => void
}

const responsiveColumns = { xs: 1, sm: 2, md: 3, xl: 4 } as const

export function DepartureHeader({ departure, onUpdated }: DepartureHeaderProps) {
  const queryClient = useQueryClient()
  const [overviewForm] = Form.useForm<DepartureOverviewFormValues>()
  const [closeForm] = Form.useForm<CloseDepartureFormValues>()
  const [unarchiveForm] = Form.useForm<UnarchiveDepartureFormValues>()
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [editDrawerOpen, setEditDrawerOpen] = useState(false)
  const [operationsSheetOpen, setOperationsSheetOpen] = useState(false)
  const [unarchiveModalOpen, setUnarchiveModalOpen] = useState(false)
  const [transitionAction, setTransitionAction] = useState<DepartureTransitionAction | null>(null)

  const overviewReadOnly =
    departure.status === DepartureStatus.SETTLED ||
    departure.status === DepartureStatus.CLOSED

  const canEdit = !overviewReadOnly
  const canTransitionToPending = canEdit && departure.status === DepartureStatus.EDITING
  const canTransitionToSettled =
    canEdit &&
    departure.status === DepartureStatus.PENDING_SETTLEMENT &&
    departure.isFinanciallySettled
  const canClose = departure.status !== DepartureStatus.CLOSED
  const canUnarchive = departure.status === DepartureStatus.CLOSED

  const invalidateDeparture = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['departure', departure.id] })
    void queryClient.invalidateQueries({ queryKey: ['departures'] })
    onUpdated()
  }, [departure.id, onUpdated, queryClient])

  const transitionMutation = useMutation({
    mutationFn: (targetStatus: DepartureStatus) =>
      transitionDeparture(departure.id, { targetStatus }),
    onSuccess: () => {
      message.success('状态已更新')
      setTransitionAction(null)
      invalidateDeparture()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '状态切换失败')
    },
  })

  const closeMutation = useMutation({
    mutationFn: (reason: string) => closeDeparture(departure.id, { reason }),
    onSuccess: () => {
      message.success('发团已关闭')
      setTransitionAction(null)
      closeForm.resetFields()
      invalidateDeparture()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '关闭失败')
    },
  })

  const unarchiveMutation = useMutation({
    mutationFn: (reason: string) => unarchiveDeparture(departure.id, { reason }),
    onSuccess: () => {
      message.success('已解除归档，发团回到待结算')
      setUnarchiveModalOpen(false)
      unarchiveForm.resetFields()
      invalidateDeparture()
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '解除归档失败')
    },
  })

  const actionLoading =
    transitionMutation.isPending || closeMutation.isPending || unarchiveMutation.isPending

  const openEditDrawer = useCallback(() => {
    overviewForm.setFieldsValue(departureToFormValues(departure))
    setEditDrawerOpen(true)
  }, [departure, overviewForm])

  const handleTransitionConfirm = () => {
    if (!transitionAction || transitionAction === 'close') {
      return
    }

    const targetStatus =
      transitionAction === 'pending_settlement'
        ? DepartureStatus.PENDING_SETTLEMENT
        : DepartureStatus.SETTLED

    transitionMutation.mutate(targetStatus)
  }

  const handleCloseSubmit = (values: CloseDepartureFormValues) => {
    closeMutation.mutate(values.reason.trim())
  }

  const handleUnarchiveSubmit = (values: UnarchiveDepartureFormValues) => {
    unarchiveMutation.mutate(values.reason.trim())
  }

  const menuItems = useMemo(() => {
    const items: NonNullable<MenuProps['items']> = []

    if (canEdit) {
      items.push({
        key: 'edit',
        label: '编辑',
        onClick: openEditDrawer,
      })
    }

    items.push({
      key: 'operations-sheet',
      label: '发团运营表',
      onClick: () => setOperationsSheetOpen(true),
    })

    items.push({
      key: 'save-template',
      label: '保存为常用路线',
      onClick: () => setSaveModalOpen(true),
    })

    const statusItems: NonNullable<MenuProps['items']> = []

    if (canTransitionToPending) {
      statusItems.push({
        key: 'pending-settlement',
        label: '切换为待结算',
        onClick: () => setTransitionAction('pending_settlement'),
      })
    }

    if (canTransitionToSettled) {
      statusItems.push({
        key: 'settled',
        label: '标记为已结清',
        onClick: () => setTransitionAction('settled'),
      })
    }

    if (canClose) {
      statusItems.push({
        key: 'close',
        label: '关闭发团',
        danger: true,
        onClick: () => setTransitionAction('close'),
      })
    }

    if (canUnarchive) {
      statusItems.push({
        key: 'unarchive',
        label: '解除归档',
        onClick: () => setUnarchiveModalOpen(true),
      })
    }

    if (statusItems.length > 0) {
      items.push({ type: 'divider' }, ...statusItems)
    }

    return items
  }, [
    canClose,
    canEdit,
    canTransitionToPending,
    canTransitionToSettled,
    canUnarchive,
    openEditDrawer,
  ])

  const ownerLabel = departure.ownerName ?? '-'

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <Link to="/departure">
          <Button type="text" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0, marginBottom: 16 }}>
            返回发团列表
          </Button>
        </Link>

        <Row justify="space-between" align="top" gutter={[16, 12]} style={{ marginBottom: 16 }}>
          <Col xs={24} lg={14}>
            <Typography.Text type="secondary">{departure.departureNo}</Typography.Text>
            <Typography.Title level={4} style={{ marginTop: 4, marginBottom: 0 }}>
              {departure.name}
            </Typography.Title>
          </Col>
          <Col xs={24} lg={10} style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Space wrap align="center">
              <Tag color={DEPARTURE_PROGRESS_COLORS[departure.departureProgress] ?? 'default'}>
                {catalogLabel(DEPARTURE_PROGRESS_LABELS, departure.departureProgress)}
              </Tag>
              <Tag color={DEPARTURE_STATUS_COLORS[departure.status as DepartureStatus] ?? 'default'}>
                {catalogLabel(DEPARTURE_STATUS_LABELS, departure.status)}
              </Tag>
              <Dropdown menu={{ items: menuItems }}>
                <Button type="link" style={{ paddingInline: 0 }}>
                  操作 <DownOutlined />
                </Button>
              </Dropdown>
            </Space>
          </Col>
        </Row>

        <Descriptions
          size="small"
          column={responsiveColumns}
          items={[
            { label: '路线名称', children: departure.routeName },
            {
              label: '发团类型',
              children: catalogLabel(DEPARTURE_TYPE_LABELS, departure.departureType),
            },
            { label: '出团日期', children: departure.startDate },
            { label: '结束日期', children: departure.endDate },
            { label: '团期天数', children: `${departure.dayCount} 天` },
            { label: '发团负责人', children: ownerLabel },
          ]}
        />

        <DepartureArchiveHistory items={departure.archiveHistory ?? []} />
        <DepartureSettlementHistory items={departure.settlementHistory ?? []} />
      </Card>

      {canUnarchive ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title="发团已关闭，当前仅可查看"
          description="如需继续处理业务或财务事项，请先解除归档。解除后发团将回到待结算，原归档履历会保留。"
          action={
            <Button size="small" type="primary" onClick={() => setUnarchiveModalOpen(true)}>
              解除归档
            </Button>
          }
        />
      ) : null}

      {canTransitionToSettled ? (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          title="全部账款已结清，可标记为已结清"
          action={
            <Button size="small" type="primary" onClick={() => setTransitionAction('settled')}>
              标记为已结清
            </Button>
          }
        />
      ) : null}

      <SaveAsRouteTemplateModal
        departure={departure}
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
      />

      <DepartureOverviewDrawer
        open={editDrawerOpen}
        departure={departure}
        form={overviewForm}
        onClose={() => {
          setEditDrawerOpen(false)
          overviewForm.resetFields()
        }}
        onUpdated={onUpdated}
      />

      <DepartureOperationsSheetDrawer
        open={operationsSheetOpen}
        departureId={departure.id}
        onClose={() => setOperationsSheetOpen(false)}
      />

      <DepartureTransitionModal
        open={transitionAction !== null}
        action={transitionAction}
        departure={departure}
        loading={actionLoading}
        closeForm={closeForm}
        onClose={() => {
          setTransitionAction(null)
          closeForm.resetFields()
        }}
        onConfirm={handleTransitionConfirm}
        onCloseSubmit={handleCloseSubmit}
      />

      <DepartureUnarchiveModal
        open={unarchiveModalOpen}
        departure={departure}
        loading={unarchiveMutation.isPending}
        form={unarchiveForm}
        onClose={() => {
          setUnarchiveModalOpen(false)
          unarchiveForm.resetFields()
        }}
        onSubmit={handleUnarchiveSubmit}
      />
    </>
  )
}

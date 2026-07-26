import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Input,
  InputNumber,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { type Dayjs } from 'dayjs'
import type { ProductImportLineCandidate } from '@/types/api'
import { useAuthStore } from '@/app/store/auth.store'
import { PageHeader } from '@/layouts/PageHeader'
import {
  confirmProductImportSession,
  downloadProductImportOriginal,
  getProductImportSession,
  type ConfirmImportLinePayload,
  type ConfirmImportSchedulePayload,
} from '@/services/product.service'
import { centsToYuan, yuanToCents } from '../utils/product-labels'
import { canEditProduct } from '../utils/product-permission'

type ScheduleDraft = Omit<ConfirmImportSchedulePayload, 'confirmed'> & {
  adultPriceText: string
  datesParseable: boolean
  confirmed: boolean
}

type LineDraft = {
  candidateKey: string
  sheetName: string
  accept: boolean
  name: string
  shortItinerary: string
  featuresText: string
  tags: string[]
  schedules: ScheduleDraft[]
}

function toScheduleDraft(
  schedule: ProductImportLineCandidate['schedules'][number],
): ScheduleDraft {
  return {
    dateRuleText: schedule.dateRuleText,
    startDate: schedule.startDate,
    endDate: schedule.endDate,
    adultPriceCents: schedule.adultPriceCents,
    childPriceCents: schedule.childPriceCents,
    singleRoomSupplementCents: schedule.singleRoomSupplementCents,
    priceOnInquiry: schedule.priceOnInquiry,
    adultPriceText: schedule.adultPriceText,
    datesParseable: schedule.datesParseable,
    // 有价且日期可解析时默认勾选「已确认」；其余须计调勾选。
    confirmed:
      (schedule.adultPriceCents != null || schedule.priceOnInquiry) && schedule.datesParseable,
  }
}

function toDraft(line: ProductImportLineCandidate): LineDraft {
  return {
    candidateKey: line.candidateKey,
    sheetName: line.sheetName,
    accept: true,
    name: line.name,
    shortItinerary: line.shortItinerary,
    featuresText: line.featuresText ?? '',
    tags: line.tags,
    schedules: line.schedules.map(toScheduleDraft),
  }
}

function toDayjs(value: string | null | undefined): Dayjs | null {
  if (!value) {
    return null
  }
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed : null
}

interface ImportColumnsOptions {
  canEdit: boolean
  pendingConfirmation: boolean
  updateDraft: (candidateKey: string, patch: Partial<LineDraft>) => void
  updateSchedule: (
    candidateKey: string,
    scheduleIndex: number,
    patch: Partial<ScheduleDraft>,
  ) => void
}

function buildImportColumns({
  canEdit,
  pendingConfirmation,
  updateDraft,
  updateSchedule,
}: ImportColumnsOptions): ColumnsType<LineDraft> {
  return [
    {
      title: '接受',
      width: 70,
      render: (_, record) => (
        <Checkbox
          checked={record.accept}
          disabled={!canEdit || !pendingConfirmation}
          onChange={(event) => updateDraft(record.candidateKey, { accept: event.target.checked })}
        />
      ),
    },
    {
      title: 'Sheet',
      dataIndex: 'sheetName',
      width: 140,
      render: (value: string) => <Tag>{value}</Tag>,
    },
    {
      title: '产品名称 / 特色',
      width: 240,
      render: (_, record) => (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input
            value={record.name}
            disabled={!record.accept || !pendingConfirmation}
            onChange={(event) => updateDraft(record.candidateKey, { name: event.target.value })}
          />
          <Input.TextArea
            autoSize={{ minRows: 1, maxRows: 3 }}
            placeholder="产品特色（可空）"
            value={record.featuresText}
            disabled={!record.accept || !pendingConfirmation}
            onChange={(event) =>
              updateDraft(record.candidateKey, { featuresText: event.target.value })
            }
          />
        </Space>
      ),
    },
    {
      title: '简版行程',
      width: 240,
      render: (_, record) => (
        <Input.TextArea
          autoSize={{ minRows: 2, maxRows: 4 }}
          value={record.shortItinerary}
          disabled={!record.accept || !pendingConfirmation}
          onChange={(event) =>
            updateDraft(record.candidateKey, { shortItinerary: event.target.value })
          }
        />
      ),
    },
    {
      title: '班期报价（须确认）',
      key: 'schedules',
      width: 420,
      render: (_, record) => (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {record.schedules.map((schedule, index) => {
            const disabled = !record.accept || !pendingConfirmation
            return (
              <Card key={`${record.candidateKey}-${index}`} size="small">
                <Typography.Text type="secondary">
                  原文：{schedule.dateRuleText || '（无）'}
                  {schedule.adultPriceText ? ` · ${schedule.adultPriceText}` : ''}
                </Typography.Text>
                <Space wrap style={{ marginTop: 8 }}>
                  <DatePicker
                    placeholder="开始日"
                    value={toDayjs(schedule.startDate)}
                    disabled={disabled}
                    onChange={(value) =>
                      updateSchedule(record.candidateKey, index, {
                        startDate: value ? value.format('YYYY-MM-DD') : null,
                      })
                    }
                  />
                  <DatePicker
                    placeholder="结束日"
                    value={toDayjs(schedule.endDate)}
                    disabled={disabled}
                    onChange={(value) =>
                      updateSchedule(record.candidateKey, index, {
                        endDate: value ? value.format('YYYY-MM-DD') : null,
                      })
                    }
                  />
                  <InputNumber
                    min={0}
                    step={1}
                    placeholder="成人价(元)"
                    disabled={disabled || schedule.priceOnInquiry}
                    value={centsToYuan(schedule.adultPriceCents)}
                    onChange={(value) =>
                      updateSchedule(record.candidateKey, index, {
                        adultPriceCents: yuanToCents(
                          typeof value === 'number' ? value : null,
                        ),
                      })
                    }
                  />
                  <Checkbox
                    checked={schedule.priceOnInquiry === true}
                    disabled={disabled}
                    onChange={(event) =>
                      updateSchedule(record.candidateKey, index, {
                        priceOnInquiry: event.target.checked,
                        adultPriceCents: event.target.checked
                          ? null
                          : schedule.adultPriceCents,
                      })
                    }
                  >
                    询价/无报价
                  </Checkbox>
                  <Checkbox
                    checked={schedule.confirmed}
                    disabled={disabled}
                    onChange={(event) =>
                      updateSchedule(record.candidateKey, index, {
                        confirmed: event.target.checked,
                      })
                    }
                  >
                    已确认价期
                  </Checkbox>
                </Space>
              </Card>
            )
          })}
        </Space>
      ),
    },
  ]
}

export function ProductImportConfirmPage() {
  const { sessionId } = useParams({ strict: false })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const canEdit = canEditProduct(useAuthStore((state) => state.actionKeys))
  const [drafts, setDrafts] = useState<LineDraft[] | null>(null)

  const { data: session, isLoading, isError } = useQuery({
    queryKey: ['product-import-session', sessionId],
    queryFn: () => getProductImportSession(sessionId!),
    enabled: Boolean(sessionId),
  })

  const lineDrafts = useMemo(() => {
    if (drafts) {
      return drafts
    }
    if (!session) {
      return []
    }
    return session.parseResult.sheets.flatMap((sheet) => sheet.lines.map(toDraft))
  }, [drafts, session])

  const confirmMutation = useMutation({
    mutationFn: (lines: ConfirmImportLinePayload[]) =>
      confirmProductImportSession(sessionId!, lines),
    onSuccess: (result) => {
      message.success(`已创建 ${result.createdProducts.length} 个草稿产品`)
      queryClient.invalidateQueries({ queryKey: ['products'] })
      void navigate({
        to: '/product',
        search: { importSessionId: result.session.id },
      })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '确认失败')
    },
  })

  if (!sessionId) {
    return <Alert type="error" message="缺少导入会话" />
  }

  if (isLoading) {
    return <Card loading />
  }

  if (isError || !session) {
    return <Alert type="error" showIcon message="导入会话加载失败" />
  }

  const updateDraft = (candidateKey: string, patch: Partial<LineDraft>) => {
    setDrafts((prev) => {
      const base = prev ?? session.parseResult.sheets.flatMap((sheet) => sheet.lines.map(toDraft))
      return base.map((row) => (row.candidateKey === candidateKey ? { ...row, ...patch } : row))
    })
  }

  const updateSchedule = (
    candidateKey: string,
    scheduleIndex: number,
    patch: Partial<ScheduleDraft>,
  ) => {
    setDrafts((prev) => {
      const base = prev ?? session.parseResult.sheets.flatMap((sheet) => sheet.lines.map(toDraft))
      return base.map((row) => {
        if (row.candidateKey !== candidateKey) {
          return row
        }
        return {
          ...row,
          schedules: row.schedules.map((schedule, index) =>
            index === scheduleIndex ? { ...schedule, ...patch } : schedule,
          ),
        }
      })
    })
  }

  const columns = buildImportColumns({
    canEdit,
    pendingConfirmation: session.status === 'pending_confirmation',
    updateDraft,
    updateSchedule,
  })

  const handleConfirm = () => {
    const accepted = lineDrafts.filter((row) => row.accept)
    if (accepted.length === 0) {
      message.warning('请至少接受一条线路')
      return
    }

    for (const row of accepted) {
      if (!row.name.trim() || !row.shortItinerary.trim()) {
        message.error(`线路「${row.name || row.candidateKey}」须填写名称与简版行程`)
        return
      }
      if (row.schedules.length === 0) {
        message.error(`线路「${row.name}」缺少班期`)
        return
      }
      for (const schedule of row.schedules) {
        if (!schedule.confirmed) {
          message.error(`线路「${row.name}」存在未确认的班期价格/日期`)
          return
        }
        if (!schedule.priceOnInquiry && schedule.adultPriceCents == null) {
          message.error(`线路「${row.name}」班期须有成人价或勾选询价/无报价`)
          return
        }
      }
    }

    const lines: ConfirmImportLinePayload[] = lineDrafts.map((row) => {
      if (!row.accept) {
        return { candidateKey: row.candidateKey, action: 'skip' }
      }
      return {
        candidateKey: row.candidateKey,
        action: 'accept',
        name: row.name.trim(),
        shortItinerary: row.shortItinerary.trim(),
        featuresText: row.featuresText.trim() || null,
        tags: row.tags,
        schedules: row.schedules.map((schedule) => ({
          dateRuleText: schedule.dateRuleText,
          startDate: schedule.startDate,
          endDate: schedule.endDate,
          adultPriceCents: schedule.adultPriceCents,
          childPriceCents: schedule.childPriceCents,
          singleRoomSupplementCents: schedule.singleRoomSupplementCents,
          priceOnInquiry: schedule.priceOnInquiry,
          confirmed: true as const,
        })),
      }
    })

    confirmMutation.mutate(lines)
  }

  return (
    <div>
      <PageHeader
        title={`导入确认 · ${session.originalFilename}`}
        action={
          <Space>
            <Button onClick={() => void navigate({ to: '/product' })}>返回列表</Button>
            <Button
              onClick={() =>
                void downloadProductImportOriginal(
                  session.storedObjectId,
                  session.originalFilename,
                )
              }
            >
              下载原件
            </Button>
            {session.status === 'pending_confirmation' ? (
              <Button
                type="primary"
                disabled={!canEdit}
                loading={confirmMutation.isPending}
                onClick={handleConfirm}
              >
                确认落草稿
              </Button>
            ) : (
              <Button type="primary">
                <Link to="/product" search={{ importSessionId: session.id }}>
                  查看本会话产品
                </Link>
              </Button>
            )}
          </Space>
        }
      />

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="接受线路前请确认（可修改）价格与班期日期；确认后仅创建草稿产品，不上架、不生成发团。"
          description={
            session.embeddedOleCount > 0
              ? `检测到 ${session.embeddedOleCount} 个内嵌文件（OLE/媒体），本期不解析、不阻断导入。`
              : '未检测到内嵌 OLE/媒体，或样本已剥离；不影响导入。'
          }
        />

        <Card>
          <Table<LineDraft>
            rowKey="candidateKey"
            columns={columns}
            dataSource={lineDrafts}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            scroll={{ x: 1200 }}
          />
        </Card>
      </Space>
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Card, Checkbox, Form, Modal, Space, Steps, Tooltip, Typography, message } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/app/store/auth.store'
import { copyDeparture, createDeparture, getDeparture, previewDepartureNo } from '@/services/departure.service'
import { getRouteTemplate } from '@/services/route-template.service'
import { listSegments } from '@/services/segment.service'
import { CreateDepartureStepInfo } from './CreateDepartureStepInfo'
import { CreateDepartureStepRoute } from './CreateDepartureStepRoute'
import {
  buildCopyDeparturePayload,
  buildCreateDeparturePayload,
  canProceedFromRouteStep,
  createInfoFormValues,
  type InfoFormValues,
  createInitialRouteStepValues,
  getShanghaiTodayString,
  type RouteStepValues,
} from '../utils/departure-wizard-form'

const STEP_ITEMS = [{ title: '选择路线' }, { title: '填写信息' }]

interface TemplateCopyModalState {
  copySegments: boolean
  copyResources: boolean
  copyReferencePrices: boolean
}

export function CreateDepartureWizard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const search = useSearch({ strict: false }) as { copyFrom?: string }
  const copyFromInitialized = useRef(false)

  const [currentStep, setCurrentStep] = useState(0)
  const [routeValues, setRouteValues] = useState<RouteStepValues>(() => createInitialRouteStepValues())
  const [initializingStep2, setInitializingStep2] = useState(false)
  const [regeneratingNo, setRegeneratingNo] = useState(false)
  const [copyModalOpen, setCopyModalOpen] = useState(false)
  const [copyModalMode, setCopyModalMode] = useState<'template' | 'departure'>('template')
  const [copyModalValues, setCopyModalValues] = useState<TemplateCopyModalState>({
    copySegments: true,
    copyResources: true,
    copyReferencePrices: true,
  })
  const [infoForm] = Form.useForm<InfoFormValues>()

  const isCopyMode = routeValues.mode === 'copy'
  const canProceed = canProceedFromRouteStep(routeValues)

  const loadDepartureNo = useCallback(async (startDate: string) => {
    const result = await previewDepartureNo(startDate)
    infoForm.setFieldValue('departureNo', result.departureNo)
    return result.departureNo
  }, [infoForm])

  const goToInfoStep = async (nextRouteValues: RouteStepValues = routeValues) => {
    if (!user) {
      message.error('请先登录')
      return
    }

    setInitializingStep2(true)
    try {
      const startDate = getShanghaiTodayString()
      const initialValues = createInfoFormValues(
        nextRouteValues,
        user.id,
        user.name,
        startDate,
        '',
      )
      infoForm.setFieldsValue(initialValues)
      await loadDepartureNo(startDate)
      setCurrentStep(1)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '团号预生成失败')
    } finally {
      setInitializingStep2(false)
    }
  }

  useEffect(() => {
    const copyFromDepartureId = search.copyFrom?.trim()
    if (!copyFromDepartureId || copyFromInitialized.current) {
      return
    }

    copyFromInitialized.current = true

    void (async () => {
      try {
        const [departure, segmentList] = await Promise.all([
          getDeparture(copyFromDepartureId),
          listSegments(copyFromDepartureId),
        ])

        setRouteValues({
          mode: 'copy',
          routeName: departure.routeName,
          defaultDayCount: departure.dayCount,
          copyFromDepartureId,
          sourceDepartureNo: departure.departureNo,
          previewSegmentCount: segmentList.summary.segmentCount,
          previewResourceCount: segmentList.summary.resourceCount,
          copySegments: true,
          copyResources: true,
          copyReferencePrices: true,
        })
        setCopyModalMode('departure')
        setCopyModalValues({
          copySegments: true,
          copyResources: true,
          copyReferencePrices: true,
        })
        setCopyModalOpen(true)
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载源发团失败')
        navigate({ to: '/departure/new', search: {} })
      }
    })()
  }, [search.copyFrom, navigate])

  const handleRouteStepNext = async () => {
    if (routeValues.mode === 'template' && routeValues.templateId) {
      try {
        const detail = await getRouteTemplate(routeValues.templateId)
        setRouteValues((current) => ({
          ...current,
          previewSegmentCount: detail.segmentCount,
          previewResourceCount: detail.resourceCount,
        }))
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载路线详情失败')
        return
      }

      setCopyModalMode('template')
      setCopyModalValues({
        copySegments: routeValues.copySegments ?? true,
        copyResources: routeValues.copyResources ?? true,
        copyReferencePrices: routeValues.copyReferencePrices ?? true,
      })
      setCopyModalOpen(true)
      return
    }

    await goToInfoStep()
  }

  const handleConfirmCopy = async () => {
    const nextRouteValues: RouteStepValues = {
      ...routeValues,
      copySegments: copyModalValues.copySegments,
      copyResources: copyModalValues.copyResources,
      copyReferencePrices: copyModalValues.copyReferencePrices,
    }
    setRouteValues(nextRouteValues)
    setCopyModalOpen(false)
    await goToInfoStep(nextRouteValues)
  }

  const handleRegenerateDepartureNo = async () => {
    const startDate = infoForm.getFieldValue('startDate') as string | undefined
    if (!startDate) {
      message.warning('请先选择出团日期')
      return
    }

    setRegeneratingNo(true)
    try {
      await loadDepartureNo(startDate)
      message.success('团号已重新生成')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '团号生成失败')
    } finally {
      setRegeneratingNo(false)
    }
  }

  const createMutation = useMutation({
    mutationFn: async (values: InfoFormValues) => {
      if (routeValues.mode === 'copy' && routeValues.copyFromDepartureId) {
        const payload = buildCopyDeparturePayload(routeValues, values)
        return copyDeparture(routeValues.copyFromDepartureId, payload)
      }

      const payload = buildCreateDeparturePayload(routeValues, values)
      return createDeparture(payload)
    },
    onSuccess: (departure) => {
      message.success('发团已创建')
      queryClient.invalidateQueries({ queryKey: ['departures'] })
      queryClient.invalidateQueries({ queryKey: ['route-templates'] })
      navigate({
        to: '/departure/$departureId',
        params: { departureId: departure.id },
        search: { tab: 'overview' },
      })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '创建失败')
    },
  })

  const handleCreate = async () => {
    try {
      const values = await infoForm.validateFields()
      createMutation.mutate(values)
    } catch {
      // validation errors are shown by antd Form
    }
  }

  const copyModalTitle =
    copyModalMode === 'departure' ? '复制已有发团' : '使用该路线建团'
  const copyModalOkText =
    copyModalMode === 'departure' ? '继续填写信息' : '使用该路线建团'

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link to="/departure">
          <Button type="text" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }}>
            返回发团列表
          </Button>
        </Link>
        <Typography.Title level={4} style={{ marginTop: 8, marginBottom: 4 }}>
          {isCopyMode ? '复制发团' : '新建发团'}
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {isCopyMode ? '基于已有发团复制行程与资源，重新填写团期信息' : '先选择路线，再填写发团基础信息'}
        </Typography.Paragraph>
      </div>

      <Card>
        {!isCopyMode ? (
          <Steps current={currentStep} items={STEP_ITEMS} style={{ marginBottom: 32 }} />
        ) : null}

        {!isCopyMode && currentStep === 0 ? (
          <CreateDepartureStepRoute values={routeValues} onChange={setRouteValues} />
        ) : (
          <CreateDepartureStepInfo
            form={infoForm}
            route={routeValues}
            regeneratingNo={regeneratingNo}
            onRegenerateDepartureNo={handleRegenerateDepartureNo}
          />
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 32,
            paddingTop: 16,
            borderTop: '1px solid #f0f0f0',
          }}
        >
          <div>
            {!isCopyMode && currentStep === 1 ? (
              <Button onClick={() => setCurrentStep(0)}>上一步</Button>
            ) : null}
          </div>
          <Space>
            {!isCopyMode && currentStep === 0 ? (
              <Button
                type="primary"
                disabled={!canProceed}
                loading={initializingStep2}
                onClick={() => void handleRouteStepNext()}
              >
                下一步
              </Button>
            ) : (
              <Button
                type="primary"
                loading={createMutation.isPending}
                onClick={() => void handleCreate()}
              >
                创建发团
              </Button>
            )}
          </Space>
        </div>
      </Card>

      <Modal
        title={copyModalTitle}
        open={copyModalOpen}
        okText={copyModalOkText}
        cancelText="取消"
        confirmLoading={initializingStep2}
        onCancel={() => {
          setCopyModalOpen(false)
          if (copyModalMode === 'departure') {
            navigate({ to: '/departure' })
          }
        }}
        onOk={() => void handleConfirmCopy()}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Checkbox
            checked={copyModalValues.copySegments}
            onChange={(event) =>
              setCopyModalValues((current) => ({
                ...current,
                copySegments: event.target.checked,
              }))
            }
          >
            复制行程段
          </Checkbox>
          <Checkbox
            checked={copyModalValues.copyResources}
            onChange={(event) =>
              setCopyModalValues((current) => ({
                ...current,
                copyResources: event.target.checked,
              }))
            }
          >
            复制资源配置
          </Checkbox>
          <Checkbox
            checked={copyModalValues.copyReferencePrices}
            onChange={(event) =>
              setCopyModalValues((current) => ({
                ...current,
                copyReferencePrices: event.target.checked,
              }))
            }
          >
            带出参考价格
          </Checkbox>
          <Tooltip
            title={
              copyModalMode === 'departure'
                ? '客源每次不同，不能从发团复制'
                : '客源每次不同，不能从模板复制'
            }
          >
            <Checkbox disabled checked={false}>
              复制客源
            </Checkbox>
          </Tooltip>
          <Tooltip
            title={
              copyModalMode === 'departure'
                ? '收付款节点不能从发团复制'
                : '收付款节点不能从模板复制'
            }
          >
            <Checkbox disabled checked={false}>
              生成应收应付
            </Checkbox>
          </Tooltip>
        </Space>
      </Modal>
    </div>
  )
}

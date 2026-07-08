import { useCallback, useState } from 'react'
import { Button, Card, Form, Space, Steps, Typography, message } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/app/store/auth.store'
import { copyDeparture, createDeparture, previewDepartureNo } from '@/services/departure.service'
import { getRouteTemplate } from '@/services/route-template.service'
import { CreateDepartureStepInfo } from './CreateDepartureStepInfo'
import { CreateDepartureStepRoute } from './CreateDepartureStepRoute'
import {
  CreateDepartureCopyModal,
  type TemplateCopyModalState,
} from './CreateDepartureCopyModal'
import { useCopyFromDepartureSearch } from '../hooks/useCopyFromDepartureSearch'
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

export function CreateDepartureWizard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const search = useSearch({ strict: false }) as { copyFrom?: string }

  const [currentStep, setCurrentStep] = useState(0)
  const [routeValues, setRouteValues] = useState<RouteStepValues>(() => createInitialRouteStepValues())
  const [initializingStep2, setInitializingStep2] = useState(false)
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

  useCopyFromDepartureSearch({
    copyFrom: search.copyFrom,
    navigate,
    setRouteValues,
    setCopyModalMode,
    setCopyModalValues,
    setCopyModalOpen,
  })

  const loadDepartureNo = useCallback(async () => {
    const result = await previewDepartureNo()
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
        startDate,
        '',
      )
      infoForm.setFieldsValue(initialValues)
      await loadDepartureNo()
      setCurrentStep(1)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '团号预生成失败')
    } finally {
      setInitializingStep2(false)
    }
  }

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

      <CreateDepartureCopyModal
        open={copyModalOpen}
        mode={copyModalMode}
        values={copyModalValues}
        title={copyModalTitle}
        okText={copyModalOkText}
        confirmLoading={initializingStep2}
        onCancel={() => {
          setCopyModalOpen(false)
          if (copyModalMode === 'departure') {
            navigate({ to: '/departure' })
          }
        }}
        onConfirm={() => void handleConfirmCopy()}
        onChange={setCopyModalValues}
      />
    </div>
  )
}

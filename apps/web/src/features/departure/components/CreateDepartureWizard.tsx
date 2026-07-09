import { useCallback, useState } from 'react'
import { Button, Card, Form, Space, Spin, Steps, Typography, message } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/app/store/auth.store'
import { copyDeparture, createDeparture, previewDepartureNo } from '@/services/departure.service'
import { getRouteTemplate } from '@/services/route-template.service'
import { CreateDepartureStepInfo } from './CreateDepartureStepInfo'
import { CreateDepartureStepRoute } from './CreateDepartureStepRoute'
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
  const copyFromId = search.copyFrom?.trim()

  const [currentStep, setCurrentStep] = useState(0)
  const [routeValues, setRouteValues] = useState<RouteStepValues>(() => createInitialRouteStepValues())
  const [initializingStep2, setInitializingStep2] = useState(() => Boolean(copyFromId))
  const [infoForm] = Form.useForm<InfoFormValues>()

  const isCopyMode = routeValues.mode === 'copy'
  const canProceed = canProceedFromRouteStep(routeValues)
  const awaitingCopySource = Boolean(copyFromId) && !isCopyMode
  const showCopyBootstrap = awaitingCopySource || (isCopyMode && (initializingStep2 || currentStep === 0))

  const loadDepartureNo = useCallback(async () => {
    const result = await previewDepartureNo()
    infoForm.setFieldValue('departureNo', result.departureNo)
    return result.departureNo
  }, [infoForm])

  const enterInfoStep = useCallback(
    async (nextRouteValues: RouteStepValues) => {
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
    },
    [infoForm, loadDepartureNo, user],
  )

  useCopyFromDepartureSearch({
    copyFrom: copyFromId,
    navigate,
    setRouteValues,
    enterInfoStep,
    onLoadError: () => setInitializingStep2(false),
  })

  const handleRouteStepNext = async () => {
    if (routeValues.mode === 'template' && routeValues.templateId) {
      try {
        const detail = await getRouteTemplate(routeValues.templateId)
        const nextRouteValues: RouteStepValues = {
          ...routeValues,
          previewSegmentCount: detail.segmentCount,
          previewResourceCount: detail.resourceCount,
        }
        setRouteValues(nextRouteValues)
        await enterInfoStep(nextRouteValues)
      } catch (error) {
        message.error(error instanceof Error ? error.message : '加载路线详情失败')
      }
      return
    }

    await enterInfoStep(routeValues)
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

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Link to="/departure">
          <Button type="text" icon={<ArrowLeftOutlined />} style={{ paddingLeft: 0 }}>
            返回发团列表
          </Button>
        </Link>
        <Typography.Title level={4} style={{ marginTop: 8, marginBottom: 4 }}>
          {isCopyMode || copyFromId ? '复制发团' : '新建发团'}
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {isCopyMode || copyFromId
            ? '基于已有发团复制行程与资源，重新填写团期信息'
            : '先选择路线，再填写发团基础信息'}
        </Typography.Paragraph>
      </div>

      <Card>
        {!isCopyMode && !copyFromId ? (
          <Steps current={currentStep} items={STEP_ITEMS} style={{ marginBottom: 32 }} />
        ) : null}

        {showCopyBootstrap ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
            <Spin tip="正在加载源发团…">
              <div style={{ minHeight: 80 }} />
            </Spin>
          </div>
        ) : !isCopyMode && currentStep === 0 ? (
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
            {!isCopyMode && !copyFromId && currentStep === 1 ? (
              <Button onClick={() => setCurrentStep(0)}>上一步</Button>
            ) : null}
          </div>
          <Space>
            {!isCopyMode && !copyFromId && currentStep === 0 ? (
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
                disabled={showCopyBootstrap || initializingStep2}
                onClick={() => void handleCreate()}
              >
                创建发团
              </Button>
            )}
          </Space>
        </div>
      </Card>
    </div>
  )
}

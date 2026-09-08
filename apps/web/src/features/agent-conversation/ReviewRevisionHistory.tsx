import { Alert, Button, Collapse, Descriptions, Space, Typography } from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { resolveReviewField } from '@xiaotuanbao/ai-contracts'
import type { AiReviewPackageView } from '@/types/api'
import { listReviewRevisions } from '@/services/agent-collaboration.service'
import { patchAiReviewPackage } from '@/services/ai-create-task.service'

export function ReviewMaterialConflicts({ pkg, canEdit }: {
  pkg: AiReviewPackageView
  canEdit: boolean
}) {
  const queryClient = useQueryClient()
  const resolve = useMutation({
    mutationFn: (corrections: Record<string, unknown>) => patchAiReviewPackage('', pkg.id, {
      expectedPackageVersion: pkg.version,
      corrections,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['departure-collaboration'] }),
  })
  if (!pkg.conflicts?.length) return null
  return <section aria-label="新材料与人工修改的差异">
    {resolve.error ? <Alert type="error" title={resolve.error.message} /> : null}
    {pkg.conflicts.map((conflict) => {
      const field = resolveReviewField(pkg.payloadSchema, pkg.confirmationUnit, conflict.fieldKey)
      const format = (value: unknown) => field ? field.format(value) : String(value ?? '未提供')
      const disabled = !canEdit || resolve.isPending || Boolean(pkg.confirmationBlockedReason)
      return <Alert key={conflict.fieldKey} type="warning" showIcon
        title={`${field?.label ?? conflict.fieldKey}有新建议，请核对`}
        description={<>
          <Typography.Paragraph>
            我的修改：{format(conflict.userCorrectedValue)}；新建议：{format(conflict.proposedValue)}
          </Typography.Paragraph>
          <Typography.Paragraph type="secondary">{field?.evidence.format(
            pkg.candidates.find((candidate) => candidate.fieldKey === conflict.fieldKey)?.evidence ?? [],
          )}</Typography.Paragraph>
          <Space wrap>
            <Button disabled={disabled} onClick={() => resolve.mutate({ [conflict.fieldKey]: conflict.userCorrectedValue })}>保留我的修改</Button>
            <Button disabled={disabled} onClick={() => resolve.mutate({ [conflict.fieldKey]: conflict.proposedValue })}>采用新建议</Button>
          </Space>
        </>} />
    })}
  </section>
}

function snapshotFields(snapshot: unknown): Record<string, unknown> {
  return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
    ? Object.fromEntries(Object.entries(snapshot))
    : {}
}

export function ReviewRevisionHistory({ pkg, focused }: {
  pkg: AiReviewPackageView
  focused: boolean
}) {
  const revisions = useQuery({
    queryKey: ['review-revisions', pkg.id, pkg.version],
    queryFn: () => listReviewRevisions(pkg.id),
    enabled: focused && pkg.version > 1,
  })
  if (pkg.version <= 1) return null
  if (revisions.isError) {
    return <Alert type="warning" title="修改记录加载失败" action={
      <Button onClick={() => void revisions.refetch()}>重试</Button>
    } />
  }
  if (!revisions.data?.length) return null
  return <Collapse size="small" items={[{
    key: 'revisions',
    label: `历次修改（${revisions.data.length}）`,
    children: [...revisions.data].reverse().map((revision) => {
      const before = snapshotFields(revision.beforeSnapshot)
      const after = snapshotFields(revision.afterSnapshot)
      const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])]
        .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      return <section key={revision.id} aria-label={`第 ${revision.packageVersion} 版修改`}>
        <Typography.Paragraph type="secondary">
          第 {revision.packageVersion} 版 · {new Date(revision.createdAt).toLocaleString('zh-CN')}
        </Typography.Paragraph>
        <Descriptions size="small" column={1} items={fields.map((key) => {
          const field = resolveReviewField(pkg.payloadSchema, pkg.confirmationUnit, key)
          const format = (value: unknown) => value == null
            ? '未提供'
            : field ? field.format(value) : typeof value === 'object' ? JSON.stringify(value) : String(value)
          return {
            key,
            label: field?.label ?? key,
            children: <>{format(before[key])} → {format(after[key])}</>,
          }
        })} />
      </section>
    }),
  }]} />
}

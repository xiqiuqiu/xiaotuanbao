import { Result } from 'antd'
import { useAuthStore } from '@/app/store/auth.store'
import { CreateDepartureWizard } from '../components/CreateDepartureWizard'
import { canEditDeparture } from '../utils/departure-permission'

export function CreateDeparturePage() {
  // 创建/复制发团、在向导内删除常用路线均属 departure:write。财务可经 /departure 菜单
  // 到达本路由，但缺 departure:write，提交会 403；故在页面层直接挡住并给出明确提示，
  // 而非让用户填完表单再吃 403。
  const canEdit = canEditDeparture(useAuthStore((s) => s.actionKeys))

  if (!canEdit) {
    return (
      <Result
        status="403"
        title="无权限创建发团"
        subTitle="仅企业管理员与计调可创建发团，财务对发团为只读。"
      />
    )
  }

  return <CreateDepartureWizard />
}

export const paths = {
  login: '/login',
  home: '/',
  departure: '/departure',
  departureNew: '/departure/new',
  financeReceivable: '/finance/receivable',
  financePayable: '/finance/payable',
  financeTransactions: '/finance/transactions',
  financeVerification: '/finance/verification',
} as const

export const departureDetailTabs = [
  '概览信息',
  '客源管理',
  '执行安排',
  '增收记录',
  '应收管理',
  '应付管理',
  '收支流水',
  '核销记录',
] as const

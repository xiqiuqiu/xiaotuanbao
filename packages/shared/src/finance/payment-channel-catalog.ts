import { PaymentChannel } from '../enums/payment-channel.enum'

export const PAYMENT_CHANNEL_OPTIONS = [
  { value: PaymentChannel.CASH, label: '现金' },
  { value: PaymentChannel.BANK_TRANSFER, label: '银行转账' },
  { value: PaymentChannel.WECHAT, label: '微信' },
  { value: PaymentChannel.ALIPAY, label: '支付宝' },
  { value: PaymentChannel.OTHER, label: '其他' },
] as const

export const PAYMENT_CHANNEL_LABELS = Object.fromEntries(
  PAYMENT_CHANNEL_OPTIONS.map((item) => [item.value, item.label]),
) as Record<PaymentChannel, string>

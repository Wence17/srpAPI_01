import { apiClient } from './apiClient'
import type { PaginatedResponse } from './types'

export type OrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'RECHARGING'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'FAILED'
  | 'REFUND_REQUESTED'
  | 'REFUNDING'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'REFUND_FAILED'

export type PaymentType = 'alipay' | 'wxpay' | 'alipay_direct' | 'wxpay_direct' | 'stripe' | 'easypay' | 'airwallex'
export type OrderType = 'balance' | 'subscription'

export interface PaymentOrder {
  id: number
  user_id: number
  amount: number
  pay_amount: number
  currency?: string
  fee_rate: number
  payment_type: PaymentType
  out_trade_no: string
  status: OrderStatus
  order_type: OrderType
  created_at: string
  expires_at: string
  paid_at?: string
  completed_at?: string
  refund_amount: number
  refund_reason?: string
  refund_requested_at?: string
  plan_id?: number
  provider_instance_id?: string
}

export interface GetMyOrdersParams {
  page?: number
  page_size?: number
  status?: OrderStatus
}

export async function getMyOrders(params?: GetMyOrdersParams) {
  const { data } = await apiClient.get<PaginatedResponse<PaymentOrder>>('/payment/orders/my', {
    params,
  })
  return data
}

export async function cancelOrder(id: number) {
  const { data } = await apiClient.post(`/payment/orders/${id}/cancel`)
  return data
}

export async function requestRefund(id: number, payload: { reason: string }) {
  const { data } = await apiClient.post(`/payment/orders/${id}/refund-request`, payload)
  return data
}

export async function getRefundEligibleProviders() {
  const { data } = await apiClient.get<{ provider_instance_ids: string[] }>('/payment/orders/refund-eligible-providers')
  return data
}

export const paymentAPI = {
  getMyOrders,
  cancelOrder,
  requestRefund,
  getRefundEligibleProviders,
}

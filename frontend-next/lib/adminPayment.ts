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

export interface DashboardStats {
  today_amount: number
  total_amount: number
  today_count: number
  total_count: number
  avg_amount: number
  daily_series: Array<{ date: string; amount: number; count: number }>
  payment_methods: Array<{ type: string; amount: number; count: number }>
  top_users: Array<{ user_id: number; email: string; amount: number }>
}

export interface SubscriptionPlan {
  id: number
  group_id: number
  group_platform?: string
  group_name?: string
  rate_multiplier?: number
  daily_limit_usd?: number | null
  weekly_limit_usd?: number | null
  monthly_limit_usd?: number | null
  supported_model_scopes?: string[]
  name: string
  description: string
  price: number
  original_price?: number
  validity_days: number
  validity_unit: string
  features: string[]
  for_sale: boolean
  sort_order: number
}

export interface GetOrdersParams {
  page?: number
  page_size?: number
  status?: OrderStatus
  payment_type?: PaymentType
  user_id?: number
  keyword?: string
  start_date?: string
  end_date?: string
  order_type?: OrderType
}

export async function getOrders(params?: GetOrdersParams) {
  const { data } = await apiClient.get<PaginatedResponse<PaymentOrder>>('/admin/payment/orders', {
    params,
  })
  return data
}

export async function getDashboard(days?: number) {
  const { data } = await apiClient.get<DashboardStats>('/admin/payment/dashboard', {
    params: days ? { days } : undefined,
  })
  return data
}

export async function getPlans() {
  const { data } = await apiClient.get<SubscriptionPlan[]>('/admin/payment/plans')
  return data
}

export async function updatePlan(id: number, updates: Partial<SubscriptionPlan>) {
  const { data } = await apiClient.put<SubscriptionPlan>(`/admin/payment/plans/${id}`, updates)
  return data
}

export async function deletePlan(id: number) {
  const { data } = await apiClient.delete(`/admin/payment/plans/${id}`)
  return data
}

export const adminPaymentAPI = {
  getOrders,
  getDashboard,
  getPlans,
  updatePlan,
  deletePlan,
}

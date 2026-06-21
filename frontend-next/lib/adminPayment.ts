import { apiClient } from './apiClient'
import type { ProviderInstance } from './payment/types'
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

export interface OrderAuditLog {
  id: number
  action: string
  detail: string | null
  operator: string | null
  created_at: string
}

export interface RefundOrderPayload {
  amount: number
  reason: string
  deduct_balance?: boolean
  force?: boolean
}

export async function getOrders(params?: GetOrdersParams) {
  const { data } = await apiClient.get<PaginatedResponse<PaymentOrder>>('/admin/payment/orders', {
    params,
  })
  return data
}

export async function getOrder(id: number) {
  const { data } = await apiClient.get<
    PaymentOrder | { order: PaymentOrder; audit_logs?: OrderAuditLog[]; auditLogs?: OrderAuditLog[] }
  >(`/admin/payment/orders/${id}`)
  if (data && typeof data === 'object' && 'order' in data) {
    const record = data as { order: PaymentOrder; audit_logs?: OrderAuditLog[]; auditLogs?: OrderAuditLog[] }
    return {
      order: record.order,
      auditLogs: record.audit_logs || record.auditLogs || [],
    }
  }
  const direct = data as PaymentOrder & { audit_logs?: OrderAuditLog[]; auditLogs?: OrderAuditLog[] }
  return {
    order: direct,
    auditLogs: direct.audit_logs || direct.auditLogs || [],
  }
}

export async function cancelOrder(id: number) {
  await apiClient.post(`/admin/payment/orders/${id}/cancel`)
}

export async function retryRecharge(id: number) {
  await apiClient.post(`/admin/payment/orders/${id}/retry`)
}

export async function refundOrder(id: number, payload: RefundOrderPayload) {
  await apiClient.post(`/admin/payment/orders/${id}/refund`, payload)
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

export async function createPlan(payload: Record<string, unknown>) {
  const { data } = await apiClient.post<SubscriptionPlan>('/admin/payment/plans', payload)
  return data
}

export async function updatePlan(id: number, updates: Record<string, unknown>) {
  const { data } = await apiClient.put<SubscriptionPlan>(`/admin/payment/plans/${id}`, updates)
  return data
}

export async function deletePlan(id: number) {
  const { data } = await apiClient.delete(`/admin/payment/plans/${id}`)
  return data
}

export async function getProviders() {
  const { data } = await apiClient.get<ProviderInstance[]>('/admin/payment/providers')
  return data
}

export async function createProvider(payload: Partial<ProviderInstance>) {
  const { data } = await apiClient.post<ProviderInstance>('/admin/payment/providers', payload)
  return data
}

export async function updateProvider(id: number, payload: Partial<ProviderInstance>) {
  const { data } = await apiClient.put<ProviderInstance>(`/admin/payment/providers/${id}`, payload)
  return data
}

export async function deleteProvider(id: number) {
  await apiClient.delete(`/admin/payment/providers/${id}`)
}

export const adminPaymentAPI = {
  getOrders,
  getOrder,
  cancelOrder,
  retryRecharge,
  refundOrder,
  getDashboard,
  getPlans,
  createPlan,
  updatePlan,
  deletePlan,
  getProviders,
  createProvider,
  updateProvider,
  deleteProvider,
}

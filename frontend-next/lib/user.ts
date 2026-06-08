import { apiClient } from './apiClient'

export interface PlatformQuotaItem {
  platform: string
  quota: number
  usage: number
  limit: number
}

export interface PlatformQuotasResponse {
  platform_quotas: PlatformQuotaItem[]
}

export interface AffiliateInvitee {
  user_id: number
  email: string
  username: string
  created_at?: string
  total_rebate: number
}

export interface UserAffiliateDetail {
  user_id: number
  aff_code: string
  inviter_id?: number | null
  aff_count: number
  aff_quota: number
  aff_frozen_quota: number
  aff_history_quota: number
  effective_rebate_rate_percent: number
  invitees: AffiliateInvitee[]
}

export interface AffiliateTransferResponse {
  transferred_quota: number
  balance: number
}

export async function getMyPlatformQuotas(): Promise<PlatformQuotasResponse> {
  const { data } = await apiClient.get<PlatformQuotasResponse>('/user/platform-quotas')
  return data
}

export async function getAffiliateDetail(): Promise<UserAffiliateDetail> {
  const { data } = await apiClient.get<UserAffiliateDetail>('/user/aff')
  return data
}

export async function transferAffiliateQuota(): Promise<AffiliateTransferResponse> {
  const { data } = await apiClient.post<AffiliateTransferResponse>('/user/aff/transfer')
  return data
}

export const userAPI = {
  getMyPlatformQuotas,
  getAffiliateDetail,
  transferAffiliateQuota,
}

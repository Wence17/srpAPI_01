import { apiClient } from './apiClient'
import type {
  TotpDisableRequest,
  TotpEnableRequest,
  TotpEnableResponse,
  TotpSetupRequest,
  TotpSetupResponse,
  TotpStatus,
  TotpVerificationMethod,
} from './types'

export async function getStatus(): Promise<TotpStatus> {
  const { data } = await apiClient.get<TotpStatus>('/user/totp/status')
  return data
}

export async function getVerificationMethod(): Promise<TotpVerificationMethod> {
  const { data } = await apiClient.get<TotpVerificationMethod>('/user/totp/verification-method')
  return data
}

export async function sendVerifyCode(): Promise<{ success: boolean }> {
  const { data } = await apiClient.post<{ success: boolean }>('/user/totp/send-code')
  return data
}

export async function initiateSetup(request?: TotpSetupRequest): Promise<TotpSetupResponse> {
  const { data } = await apiClient.post<TotpSetupResponse>('/user/totp/setup', request || {})
  return data
}

export async function enable(request: TotpEnableRequest): Promise<TotpEnableResponse> {
  const { data } = await apiClient.post<TotpEnableResponse>('/user/totp/enable', request)
  return data
}

export async function disable(request: TotpDisableRequest): Promise<{ success: boolean }> {
  const { data } = await apiClient.post<{ success: boolean }>('/user/totp/disable', request)
  return data
}

export const totpAPI = {
  getStatus,
  getVerificationMethod,
  sendVerifyCode,
  initiateSetup,
  enable,
  disable,
}

export default totpAPI

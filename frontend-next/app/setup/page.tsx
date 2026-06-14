'use client'

import { useCallback, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import {
  install,
  testDatabase,
  testRedis,
  type InstallRequest,
} from '@/lib/setup'
import Select from '@/components/common/Select'
import Toggle from '@/components/common/Toggle'
import Icon from '@/components/icons/Icon'

function getCurrentPort(): number {
  if (typeof window === 'undefined') return 80
  const port = window.location.port
  if (port) {
    return parseInt(port, 10)
  }
  return window.location.protocol === 'https:' ? 443 : 80
}

function createDefaultFormData(): InstallRequest {
  return {
    database: {
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: '',
      dbname: 'sub2api',
      sslmode: 'disable',
    },
    redis: {
      host: 'localhost',
      port: 6379,
      password: '',
      db: 0,
      enable_tls: false,
    },
    admin: {
      email: '',
      password: '',
    },
    server: {
      host: '0.0.0.0',
      port: getCurrentPort(),
      mode: 'release',
    },
  }
}

function extractSetupError(error: unknown, fallback = 'Connection failed'): string {
  const err = error as {
    response?: { data?: { detail?: string; message?: string } }
    message?: string
  }
  return (
    err.response?.data?.detail ||
    err.response?.data?.message ||
    err.message ||
    fallback
  )
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

export default function SetupPage() {
  const { t } = useI18n()

  const steps = useMemo(
    () => [
      { id: 'database', title: t('setup.database.title') },
      { id: 'redis', title: t('setup.redis.title') },
      { id: 'admin', title: t('setup.admin.title') },
      { id: 'complete', title: t('setup.ready.title') },
    ],
    [t],
  )

  const [currentStep, setCurrentStep] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [installSuccess, setInstallSuccess] = useState(false)
  const [testingDb, setTestingDb] = useState(false)
  const [testingRedis, setTestingRedis] = useState(false)
  const [dbConnected, setDbConnected] = useState(false)
  const [redisConnected, setRedisConnected] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [serviceReady, setServiceReady] = useState(false)
  const [formData, setFormData] = useState<InstallRequest>(() => createDefaultFormData())

  const canProceed = useMemo(() => {
    switch (currentStep) {
      case 0:
        return dbConnected
      case 1:
        return redisConnected
      case 2:
        return (
          Boolean(formData.admin.email) &&
          formData.admin.password.length >= 8 &&
          formData.admin.password === confirmPassword
        )
      default:
        return true
    }
  }, [currentStep, dbConnected, redisConnected, formData.admin.email, formData.admin.password, confirmPassword])

  const updateDatabase = useCallback(
    (patch: Partial<InstallRequest['database']>) => {
      setFormData((prev) => ({ ...prev, database: { ...prev.database, ...patch } }))
    },
    [],
  )

  const updateRedis = useCallback((patch: Partial<InstallRequest['redis']>) => {
    setFormData((prev) => ({ ...prev, redis: { ...prev.redis, ...patch } }))
  }, [])

  const updateAdmin = useCallback((patch: Partial<InstallRequest['admin']>) => {
    setFormData((prev) => ({ ...prev, admin: { ...prev.admin, ...patch } }))
  }, [])

  const waitForServiceRestart = useCallback(async () => {
    const maxAttempts = 60
    const interval = 1000

    await new Promise((resolve) => setTimeout(resolve, 3000))

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch('/setup/status', {
          method: 'GET',
          cache: 'no-store',
        })

        if (response.ok) {
          const data = await response.json()
          if (data.data && !data.data.needs_setup) {
            setServiceReady(true)
            setTimeout(() => {
              window.location.href = '/login'
            }, 1500)
            return
          }
        }
      } catch {
        // Service not ready or network error during restart, continue polling
      }

      await new Promise((resolve) => setTimeout(resolve, interval))
    }

    setErrorMessage(t('setup.status.timeout'))
  }, [t])

  async function testDatabaseConnection() {
    setTestingDb(true)
    setErrorMessage('')
    setDbConnected(false)

    try {
      await testDatabase(formData.database)
      setDbConnected(true)
    } catch (error: unknown) {
      setErrorMessage(extractSetupError(error))
    } finally {
      setTestingDb(false)
    }
  }

  async function testRedisConnection() {
    setTestingRedis(true)
    setErrorMessage('')
    setRedisConnected(false)

    try {
      await testRedis(formData.redis)
      setRedisConnected(true)
    } catch (error: unknown) {
      setErrorMessage(extractSetupError(error))
    } finally {
      setTestingRedis(false)
    }
  }

  function nextStep() {
    if (canProceed) {
      setErrorMessage('')
      setCurrentStep((step) => step + 1)
    }
  }

  async function performInstall() {
    setInstalling(true)
    setErrorMessage('')

    try {
      await install(formData)
      setInstallSuccess(true)
      void waitForServiceRestart()
    } catch (error: unknown) {
      setErrorMessage(extractSetupError(error, 'Installation failed'))
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4 dark:from-dark-900 dark:to-dark-800">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-lg">
            <Icon name="cog" size="xl" className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('setup.title')}</h1>
          <p className="mt-2 text-gray-500 dark:text-dark-400">{t('setup.description')}</p>
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-center">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className="flex items-center">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                      currentStep > index
                        ? 'bg-primary-500 text-white'
                        : currentStep === index
                          ? 'bg-primary-500 text-white ring-4 ring-primary-100 dark:ring-primary-900'
                          : 'bg-gray-200 text-gray-500 dark:bg-dark-700 dark:text-dark-400'
                    }`}
                  >
                    {currentStep > index ? (
                      <Icon name="check" size="md" strokeWidth={2} />
                    ) : (
                      <span>{index + 1}</span>
                    )}
                  </div>
                  <span
                    className={`ml-2 text-sm font-medium ${
                      currentStep >= index
                        ? 'text-gray-900 dark:text-white'
                        : 'text-gray-400 dark:text-dark-500'
                    }`}
                  >
                    {step.title}
                  </span>
                </div>
                {index < steps.length - 1 ? (
                  <div
                    className={`mx-3 h-0.5 w-12 ${
                      currentStep > index ? 'bg-primary-500' : 'bg-gray-200 dark:bg-dark-700'
                    }`}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-xl dark:bg-dark-800">
          {currentStep === 0 ? (
            <div className="space-y-6">
              <div className="mb-6 text-center">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {t('setup.database.title')}
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-dark-400">
                  {t('setup.database.description')}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label">{t('setup.database.host')}</label>
                  <input
                    value={formData.database.host}
                    onChange={(e) => updateDatabase({ host: e.target.value })}
                    type="text"
                    className="input"
                    placeholder="localhost"
                  />
                </div>
                <div>
                  <label className="input-label">{t('setup.database.port')}</label>
                  <input
                    value={formData.database.port}
                    onChange={(e) => updateDatabase({ port: Number(e.target.value) })}
                    type="number"
                    className="input"
                    placeholder="5432"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-gray-200 p-3 dark:border-dark-700">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {t('setup.redis.enableTls')}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-dark-400">
                    {t('setup.redis.enableTlsHint')}
                  </p>
                </div>
                <Toggle
                  modelValue={formData.redis.enable_tls}
                  onUpdateModelValue={(value) => updateRedis({ enable_tls: value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label">{t('setup.database.username')}</label>
                  <input
                    value={formData.database.user}
                    onChange={(e) => updateDatabase({ user: e.target.value })}
                    type="text"
                    className="input"
                    placeholder="postgres"
                  />
                </div>
                <div>
                  <label className="input-label">{t('setup.database.password')}</label>
                  <input
                    value={formData.database.password}
                    onChange={(e) => updateDatabase({ password: e.target.value })}
                    type="password"
                    className="input"
                    placeholder={t('setup.database.passwordPlaceholder')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label">{t('setup.database.databaseName')}</label>
                  <input
                    value={formData.database.dbname}
                    onChange={(e) => updateDatabase({ dbname: e.target.value })}
                    type="text"
                    className="input"
                    placeholder="sub2api"
                  />
                </div>
                <div>
                  <label className="input-label">{t('setup.database.sslMode')}</label>
                  <Select
                    modelValue={formData.database.sslmode}
                    onUpdateModelValue={(value) => updateDatabase({ sslmode: String(value) })}
                    options={[
                      { value: 'disable', label: t('setup.database.ssl.disable') },
                      { value: 'require', label: t('setup.database.ssl.require') },
                      { value: 'verify-ca', label: t('setup.database.ssl.verifyCa') },
                      { value: 'verify-full', label: t('setup.database.ssl.verifyFull') },
                    ]}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => void testDatabaseConnection()}
                disabled={testingDb}
                className="btn btn-secondary w-full"
              >
                {testingDb ? (
                  <SpinnerIcon className="-ml-1 mr-2 h-4 w-4 animate-spin" />
                ) : dbConnected ? (
                  <Icon name="check" size="md" className="mr-2 text-green-500" strokeWidth={2} />
                ) : null}
                {testingDb
                  ? t('setup.status.testing')
                  : dbConnected
                    ? t('setup.status.success')
                    : t('setup.status.testConnection')}
              </button>
            </div>
          ) : null}

          {currentStep === 1 ? (
            <div className="space-y-6">
              <div className="mb-6 text-center">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {t('setup.redis.title')}
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-dark-400">
                  {t('setup.redis.description')}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label">{t('setup.redis.host')}</label>
                  <input
                    value={formData.redis.host}
                    onChange={(e) => updateRedis({ host: e.target.value })}
                    type="text"
                    className="input"
                    placeholder="localhost"
                  />
                </div>
                <div>
                  <label className="input-label">{t('setup.redis.port')}</label>
                  <input
                    value={formData.redis.port}
                    onChange={(e) => updateRedis({ port: Number(e.target.value) })}
                    type="number"
                    className="input"
                    placeholder="6379"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="input-label">{t('setup.redis.password')}</label>
                  <input
                    value={formData.redis.password}
                    onChange={(e) => updateRedis({ password: e.target.value })}
                    type="password"
                    className="input"
                    placeholder={t('setup.redis.passwordPlaceholder')}
                  />
                </div>
                <div>
                  <label className="input-label">{t('setup.redis.database')}</label>
                  <input
                    value={formData.redis.db}
                    onChange={(e) => updateRedis({ db: Number(e.target.value) })}
                    type="number"
                    className="input"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-gray-200 p-3 dark:border-dark-700">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {t('setup.redis.enableTls')}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-dark-400">
                    {t('setup.redis.enableTlsHint')}
                  </p>
                </div>
                <Toggle
                  modelValue={formData.redis.enable_tls}
                  onUpdateModelValue={(value) => updateRedis({ enable_tls: value })}
                />
              </div>

              <button
                type="button"
                onClick={() => void testRedisConnection()}
                disabled={testingRedis}
                className="btn btn-secondary w-full"
              >
                {testingRedis ? (
                  <SpinnerIcon className="-ml-1 mr-2 h-4 w-4 animate-spin" />
                ) : redisConnected ? (
                  <Icon name="check" size="md" className="mr-2 text-green-500" strokeWidth={2} />
                ) : null}
                {testingRedis
                  ? t('setup.status.testing')
                  : redisConnected
                    ? t('setup.status.success')
                    : t('setup.status.testConnection')}
              </button>
            </div>
          ) : null}

          {currentStep === 2 ? (
            <div className="space-y-6">
              <div className="mb-6 text-center">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {t('setup.admin.title')}
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-dark-400">
                  {t('setup.admin.description')}
                </p>
              </div>

              <div>
                <label className="input-label">{t('setup.admin.email')}</label>
                <input
                  value={formData.admin.email}
                  onChange={(e) => updateAdmin({ email: e.target.value })}
                  type="email"
                  className="input"
                  placeholder="admin@example.com"
                />
              </div>

              <div>
                <label className="input-label">{t('setup.admin.password')}</label>
                <input
                  value={formData.admin.password}
                  onChange={(e) => updateAdmin({ password: e.target.value })}
                  type="password"
                  className="input"
                  placeholder={t('setup.admin.passwordPlaceholder')}
                />
              </div>

              <div>
                <label className="input-label">{t('setup.admin.confirmPassword')}</label>
                <input
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  type="password"
                  className="input"
                  placeholder={t('setup.admin.confirmPasswordPlaceholder')}
                />
                {confirmPassword && formData.admin.password !== confirmPassword ? (
                  <p className="input-error-text">{t('setup.admin.passwordMismatch')}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {currentStep === 3 ? (
            <div className="space-y-6">
              <div className="mb-6 text-center">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {t('setup.ready.title')}
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-dark-400">
                  {t('setup.ready.description')}
                </p>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl bg-gray-50 p-4 dark:bg-dark-700">
                  <h3 className="mb-2 text-sm font-medium text-gray-500 dark:text-dark-400">
                    {t('setup.ready.database')}
                  </h3>
                  <p className="text-gray-900 dark:text-white">
                    {formData.database.user}@{formData.database.host}:{formData.database.port}/
                    {formData.database.dbname}
                  </p>
                </div>

                <div className="rounded-xl bg-gray-50 p-4 dark:bg-dark-700">
                  <h3 className="mb-2 text-sm font-medium text-gray-500 dark:text-dark-400">
                    {t('setup.ready.redis')}
                  </h3>
                  <p className="text-gray-900 dark:text-white">
                    {formData.redis.host}:{formData.redis.port}
                  </p>
                </div>

                <div className="rounded-xl bg-gray-50 p-4 dark:bg-dark-700">
                  <h3 className="mb-2 text-sm font-medium text-gray-500 dark:text-dark-400">
                    {t('setup.ready.adminEmail')}
                  </h3>
                  <p className="text-gray-900 dark:text-white">{formData.admin.email}</p>
                </div>
              </div>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800/50 dark:bg-red-900/20">
              <div className="flex items-start gap-3">
                <Icon name="exclamationCircle" size="md" className="flex-shrink-0 text-red-500" />
                <p className="text-sm text-red-700 dark:text-red-400">{errorMessage}</p>
              </div>
            </div>
          ) : null}

          {installSuccess ? (
            <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-800/50 dark:bg-green-900/20">
              <div className="flex items-start gap-3">
                {!serviceReady ? (
                  <SpinnerIcon className="h-5 w-5 flex-shrink-0 animate-spin text-green-500" />
                ) : (
                  <Icon name="checkCircle" size="md" className="flex-shrink-0 text-green-500" />
                )}
                <div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-400">
                    {t('setup.status.completed')}
                  </p>
                  <p className="mt-1 text-sm text-green-600 dark:text-green-500">
                    {serviceReady ? t('setup.status.redirecting') : t('setup.status.restarting')}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex justify-between">
            {currentStep > 0 && !installSuccess ? (
              <button type="button" onClick={() => setCurrentStep((step) => step - 1)} className="btn btn-secondary">
                <Icon name="chevronLeft" size="sm" className="mr-2" strokeWidth={2} />
                {t('common.back')}
              </button>
            ) : (
              <div />
            )}

            {currentStep < 3 ? (
              <button type="button" onClick={nextStep} disabled={!canProceed} className="btn btn-primary">
                {t('common.next')}
                <Icon name="chevronRight" size="sm" className="ml-2" strokeWidth={2} />
              </button>
            ) : !installSuccess ? (
              <button
                type="button"
                onClick={() => void performInstall()}
                disabled={installing}
                className="btn btn-primary"
              >
                {installing ? <SpinnerIcon className="-ml-1 mr-2 h-4 w-4 animate-spin" /> : null}
                {installing ? t('setup.status.installing') : t('setup.status.completeInstallation')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

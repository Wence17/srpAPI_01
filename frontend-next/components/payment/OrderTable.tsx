'use client'

import { useMemo, type ReactNode } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import type { PaymentOrder } from '@/lib/payment/types'
import type { Column } from '@/components/common/types'
import DataTable from '@/components/common/DataTable'
import OrderStatusBadge from '@/components/payment/OrderStatusBadge'

interface OrderTableProps {
  orders: PaymentOrder[]
  loading: boolean
  showUser?: boolean
  renderActions?: (row: PaymentOrder) => ReactNode
}

type OrderRow = PaymentOrder & {
  user_email?: string
  user_name?: string
  user_notes?: string
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString()
}

export default function OrderTable({ orders, loading, showUser, renderActions }: OrderTableProps) {
  const { t } = useI18n()

  const columns = useMemo<Column[]>(() => {
    const cols: Column[] = [
      { key: 'id', label: t('payment.orders.orderId') },
      { key: 'out_trade_no', label: t('payment.orders.orderNo') },
    ]
    if (showUser) {
      cols.push({ key: 'user_email', label: t('payment.admin.colUser') })
    }
    cols.push(
      { key: 'pay_amount', label: t('payment.orders.payAmount') },
      { key: 'payment_type', label: t('payment.orders.paymentMethod') },
      { key: 'status', label: t('payment.orders.status') },
      { key: 'created_at', label: t('payment.orders.createdAt') },
      { key: 'actions', label: t('common.actions') },
    )
    return cols
  }, [t, showUser])

  return (
    <DataTable
      columns={columns}
      data={orders}
      loading={loading}
      cells={{
        id: ({ value }) => <span className="font-mono text-sm">#{value}</span>,
        out_trade_no: ({ value }) => (
          <span className="text-sm text-gray-900 dark:text-white">{value}</span>
        ),
        user_email: ({ value, row }) => {
          const r = row as OrderRow
          return (
            <div className="text-sm">
              <span className="text-gray-900 dark:text-white">
                {value || r.user_name || '#' + r.user_id}
              </span>
              {r.user_notes ? (
                <span className="ml-1 text-xs text-gray-400">({r.user_notes})</span>
              ) : null}
            </div>
          )
        },
        pay_amount: ({ value, row }) => {
          const r = row as OrderRow
          return (
            <div className="text-sm">
              <span className="font-medium text-gray-900 dark:text-white">
                ¥{(value as number).toFixed(2)}
              </span>
              {r.fee_rate > 0 ? (
                <span
                  className="ml-1 text-xs text-gray-400"
                  title={t('payment.orders.fee') + ': ' + r.fee_rate + '%'}
                >
                  ({t('payment.orders.fee')} {r.fee_rate}%)
                </span>
              ) : null}
              {r.amount !== r.pay_amount ? (
                <div className="text-xs text-gray-500">
                  {t('payment.orders.creditedAmount')}: {r.order_type === 'balance' ? '$' : '¥'}
                  {r.amount.toFixed(2)}
                </div>
              ) : null}
            </div>
          )
        },
        payment_type: ({ value }) => (
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {t('payment.methods.' + value, value as string)}
          </span>
        ),
        status: ({ value }) => <OrderStatusBadge status={value} />,
        created_at: ({ value }) => (
          <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(value as string)}</span>
        ),
        actions: ({ row }) => (renderActions ? renderActions(row as PaymentOrder) : null),
      }}
    />
  )
}

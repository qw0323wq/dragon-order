'use client'

import {
  Phone, Pencil, Trash2, AlertCircle, Package,
  CreditCard, Building2, MapPin, Truck, ShoppingCart,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { Supplier } from './types'
import { CATEGORY_COLORS, PAYMENT_TYPE_STYLES } from './types'

interface SupplierCardProps {
  supplier: Supplier
  onEdit: (supplier: Supplier) => void
  onDelete: (id: number) => void
}

export function SupplierCard({ supplier, onEdit, onDelete }: SupplierCardProps) {
  const categoryStyle = CATEGORY_COLORS[supplier.category] ?? 'bg-muted text-muted-foreground'
  const paymentStyle = PAYMENT_TYPE_STYLES[supplier.paymentType] ?? 'bg-muted text-muted-foreground'

  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
  const noDeliveryText = supplier.noDeliveryDays.length > 0
    ? `週${supplier.noDeliveryDays.map((d) => WEEKDAYS[d]).join('、')}不配`
    : ''

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {supplier.code && (
                <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{supplier.code}</span>
              )}
              <span className="font-heading font-semibold text-base">{supplier.name}</span>
              <span className={`inline-flex h-5 items-center rounded-full px-2 text-xs font-medium ${categoryStyle}`}>
                {supplier.category}
              </span>
              <span className={`inline-flex h-5 items-center gap-1 rounded-full px-2 text-xs font-medium border ${paymentStyle}`}>
                <CreditCard className="size-2.5" />
                {supplier.paymentType}
              </span>
              {noDeliveryText && (
                <span className="inline-flex items-center gap-1 text-xs text-destructive font-medium">
                  <AlertCircle className="size-3" />
                  {noDeliveryText}
                </span>
              )}
            </div>

            {(supplier.companyName || supplier.taxId) && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                {supplier.companyName && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Building2 className="size-3.5 shrink-0" />
                    <span>{supplier.companyName}</span>
                  </div>
                )}
                {supplier.taxId && (
                  <span className="text-xs text-muted-foreground/70 font-mono">統編：{supplier.taxId}</span>
                )}
              </div>
            )}

            <div className="mt-2 space-y-1">
              {supplier.contact
                ? <p className="text-sm text-muted-foreground">{supplier.contact}</p>
                : <p className="text-sm text-muted-foreground/50 italic">聯絡人未填</p>
              }
              {supplier.phone ? (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Phone className="size-3.5" /> {supplier.phone}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground/50 italic">電話未填</p>
              )}
            </div>

            {supplier.address && (
              <div className="flex items-start gap-1.5 mt-1.5 text-sm text-muted-foreground">
                <MapPin className="size-3.5 mt-0.5 shrink-0" />
                <span>{supplier.address}</span>
              </div>
            )}

            {(supplier.deliveryDays != null || (supplier.freeShippingMin != null && supplier.freeShippingMin > 0)) && (
              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                {supplier.deliveryDays != null && supplier.deliveryDays > 0 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Truck className="size-3.5" /> 送貨 {supplier.deliveryDays} 天
                  </div>
                )}
                {supplier.freeShippingMin != null && supplier.freeShippingMin > 0 && (
                  <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                    <ShoppingCart className="size-3.5" /> 滿 ${supplier.freeShippingMin.toLocaleString()} 免運
                  </div>
                )}
              </div>
            )}

            <a href={`/dashboard/suppliers/${supplier.id}`}
              className="flex items-center gap-1 mt-2 text-xs text-primary hover:underline cursor-pointer">
              <Package className="size-3.5" /> {supplier.itemsCount} 個品項 →
            </a>
          </div>

          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" onClick={() => onEdit(supplier)} title="編輯">
              <Pencil className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onDelete(supplier.id)} title="刪除"
              className="text-destructive hover:text-destructive">
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

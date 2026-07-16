'use client'

/**
 * 訂單歷史紀錄 Dialog — 狀態變化時間線（參考 Costflows 訂單歷史）
 * 每筆：狀態 badge + 操作人 + 備註 + 時間；新的在上面。
 * 開啟時才 fetch，/api/orders/[id]/history 對舊訂單會合成「訂單建立」首筆。
 */

import { useEffect, useState } from 'react'
import { Loader2, History } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { STATUS_LABELS, STATUS_COLORS } from './types'

interface HistoryEvent {
  id: number
  status: string
  note: string | null
  createdAt: string
  changedByName: string | null
}

interface OrderHistoryDialogProps {
  orderId: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function OrderHistoryDialog({ orderId, open, onOpenChange }: OrderHistoryDialogProps) {
  const [events, setEvents] = useState<HistoryEvent[] | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setEvents(null)
    fetch(`/api/orders/${orderId}/history`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => { if (!cancelled) setEvents(data.events || []) })
      .catch(() => { if (!cancelled) setEvents([]) })
    return () => { cancelled = true }
  }, [open, orderId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4" /> 訂單歷史紀錄
          </DialogTitle>
        </DialogHeader>

        {events === null ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : events.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">沒有歷史紀錄</p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {/* 時間線：左側圓點 + 連接線 */}
            <div className="relative pl-5">
              <div className="absolute left-[5px] top-2 bottom-2 w-px bg-border" />
              <div className="space-y-4">
                {events.map((e) => (
                  <div key={`${e.id}-${e.createdAt}`} className="relative">
                    <span className="absolute -left-5 top-1.5 size-[11px] rounded-full border-2 border-background bg-primary" />
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={STATUS_COLORS[e.status] || ''}>
                        {STATUS_LABELS[e.status] || e.status}
                      </Badge>
                      {e.note && <span className="text-xs text-muted-foreground">{e.note}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {e.changedByName ? `${e.changedByName} · ` : ''}
                      {formatTime(e.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

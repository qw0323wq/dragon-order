'use client'

/**
 * 價格走勢頁 — 追蹤供應商報價波動
 * 顯示：最近價格變動列表 + 按供應商篩選 + 漲跌標示
 */

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, Upload, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PriceRecord {
  id: number
  item_id: number
  item_name: string
  supplier_name: string
  old_price: number
  new_price: number
  price_diff: number
  change_percent: string
  price_unit: string
  effective_date: string
  source: string
}

interface Supplier {
  id: number
  name: string
}

export default function PriceTrendsPage() {
  const [records, setRecords] = useState<PriceRecord[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [selectedSupplier, setSelectedSupplier] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<string | null>(null)

  useEffect(() => {
    // 載入供應商列表
    fetch('/api/suppliers')
      .then((r) => r.json())
      .then((data) => setSuppliers(Array.isArray(data) ? data : []))
      .catch(() => {})

    loadHistory()
  }, [])

  async function loadHistory(supplierId?: string) {
    setLoading(true)
    const url = supplierId
      ? `/api/price-history?supplier_id=${supplierId}`
      : '/api/price-history'
    const res = await fetch(url)
    if (res.ok) {
      const data = await res.json()
      setRecords(data)
    }
    setLoading(false)
  }

  function handleSupplierChange(value: string) {
    setSelectedSupplier(value)
    loadHistory(value || undefined)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedSupplier) return

    setUploading(true)
    setUploadResult(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('supplier_id', selectedSupplier)
    formData.append('source', `${file.name}`)

    const res = await fetch('/api/price-history/upload', {
      method: 'POST',
      body: formData,
    })

    if (res.ok) {
      const result = await res.json()
      setUploadResult(
        `解析 ${result.parsed} 項：${result.updated} 項更新、${result.unchanged} 項不變、${result.unmatched} 項未匹配`
      )
      // 重新載入
      loadHistory(selectedSupplier)
    } else {
      const err = await res.json().catch(() => ({ error: '上傳失敗' }))
      setUploadResult(`❌ ${err.error}`)
    }

    setUploading(false)
    e.target.value = ''
  }

  // 統計
  const upCount = records.filter((r) => r.price_diff > 0).length
  const downCount = records.filter((r) => r.price_diff < 0).length

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">價格走勢</h2>
          <p className="text-sm text-muted-foreground">追蹤供應商報價波動，掌握成本變化</p>
        </div>

        {/* 上傳報價單 */}
        <div className="flex items-center gap-2">
          <select
            value={selectedSupplier}
            onChange={(e) => handleSupplierChange(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">全部供應商</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {selectedSupplier && (
            <label>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
              <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-input bg-background text-sm font-medium cursor-pointer hover:bg-muted">
                <Upload className="size-3.5" />
                {uploading ? '上傳中...' : '上傳報價單'}
              </span>
            </label>
          )}
        </div>
      </div>

      {uploadResult && (
        <div className="p-3 rounded-lg bg-muted text-sm">{uploadResult}</div>
      )}

      {/* 統計卡片 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg border bg-card">
          <div className="text-sm text-muted-foreground">紀錄筆數</div>
          <div className="text-2xl font-semibold mt-1">{records.length}</div>
        </div>
        <div className="p-3 rounded-lg border bg-card">
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <TrendingUp className="size-3.5 text-red-500" /> 漲價
          </div>
          <div className="text-2xl font-semibold mt-1 text-red-600">{upCount}</div>
        </div>
        <div className="p-3 rounded-lg border bg-card">
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <TrendingDown className="size-3.5 text-green-500" /> 降價
          </div>
          <div className="text-2xl font-semibold mt-1 text-green-600">{downCount}</div>
        </div>
      </div>

      {/* 價格變動列表 */}
      {loading ? (
        <p className="text-sm text-muted-foreground">載入中...</p>
      ) : records.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ArrowUpDown className="size-8 mx-auto mb-2 opacity-50" />
          <p>尚無價格變動紀錄</p>
          <p className="text-xs mt-1">選擇供應商後上傳報價單，系統會自動比對價差</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">品項</th>
                <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">供應商</th>
                <th className="text-right px-4 py-2.5 font-medium">舊價</th>
                <th className="text-right px-4 py-2.5 font-medium">新價</th>
                <th className="text-right px-4 py-2.5 font-medium">漲跌</th>
                <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">生效日</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {records.map((r) => {
                const isUp = r.price_diff > 0
                const isDown = r.price_diff < 0
                return (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{r.item_name}</div>
                      <div className="text-xs text-muted-foreground md:hidden">{r.supplier_name}</div>
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell text-muted-foreground">
                      {r.supplier_name}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      ${r.old_price}/{r.price_unit}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      ${r.new_price}/{r.price_unit}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={cn(
                          'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium',
                          isUp && 'bg-red-50 text-red-700',
                          isDown && 'bg-green-50 text-green-700',
                          !isUp && !isDown && 'bg-gray-50 text-gray-600'
                        )}
                      >
                        {isUp && <TrendingUp className="size-3" />}
                        {isDown && <TrendingDown className="size-3" />}
                        {!isUp && !isDown && <Minus className="size-3" />}
                        {isUp ? '+' : ''}
                        {r.price_diff} ({r.change_percent}%)
                      </span>
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell text-muted-foreground text-xs">
                      {r.effective_date}
                      {r.source && (
                        <div className="text-xs opacity-70">{r.source}</div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

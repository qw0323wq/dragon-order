'use client';

/**
 * 訂單明細 Tab（唯讀 + 門市篩選）
 * 跨供應商跨門市的 flat 稽核檢視，不支援編輯（要改數量從「彙總」Tab 進入）。
 */

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { sumBy, formatCurrency } from '@/lib/format';
import type { OrderDetail } from './types';

interface DetailTabWithFilterProps {
  details: OrderDetail[];
}

export function DetailTabWithFilter({ details }: DetailTabWithFilterProps) {
  const [storeFilter, setStoreFilter] = useState('all');
  const storeNames = [...new Set(details.map((d) => d.storeName))].sort();
  const filtered = storeFilter === 'all' ? details : details.filter((d) => d.storeName === storeFilter);
  const total = sumBy(filtered, (d) => d.subtotal);

  return (
    <div className="space-y-3">
      {/* 門市篩選 */}
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => setStoreFilter('all')}
          className={`inline-flex min-h-8 items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            storeFilter === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
          }`}
        >
          全部 <span className="opacity-70 tabular-nums">({details.length})</span>
        </button>
        {storeNames.map((name) => {
          const count = details.filter((d) => d.storeName === name).length;
          return (
            <button
              key={name}
              onClick={() => setStoreFilter(name)}
              className={`inline-flex min-h-8 items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                storeFilter === name
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
              }`}
            >
              {name} <span className="opacity-70 tabular-nums">({count})</span>
            </button>
          );
        })}
      </div>
      <Card>
        <CardContent className="px-0">
          {/* 密集稽核表：限高捲動 + 表頭/合計列固定，長訂單也能對照欄位 */}
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-muted/50 [&>th]:border-b [&>th]:backdrop-blur-sm">
                  <th className="text-left py-2 pl-3 sm:pl-4 font-normal">品項</th>
                  <th className="text-left py-2 px-2 font-normal">叫貨人</th>
                  {storeFilter === 'all' && <th className="text-left py-2 px-2 font-normal">門市</th>}
                  <th className="text-left py-2 px-2 font-normal">供應商</th>
                  <th className="text-right py-2 px-2 font-normal">數量</th>
                  <th className="text-left py-2 px-2 font-normal">單位</th>
                  <th className="text-right py-2 px-2 font-normal">單價</th>
                  <th className="text-right py-2 pr-3 sm:pr-4 font-normal">小計</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                    <td className="py-2 pl-3 sm:pl-4 font-medium">{d.itemName}</td>
                    <td className="py-2 px-2 text-xs text-muted-foreground whitespace-nowrap">
                      {d.createdByName || '—'}
                    </td>
                    {storeFilter === 'all' && (
                      <td className="py-2 px-2 text-xs text-muted-foreground whitespace-nowrap">{d.storeName}</td>
                    )}
                    <td className="py-2 px-2 text-xs text-muted-foreground whitespace-nowrap">{d.supplierName}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{parseFloat(d.quantity)}</td>
                    <td className="py-2 px-2 text-xs text-muted-foreground">{d.unit}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                      {formatCurrency(d.unitPrice)}
                    </td>
                    <td className="py-2 pr-3 sm:pr-4 text-right tabular-nums whitespace-nowrap">
                      {formatCurrency(d.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold [&>td]:sticky [&>td]:bottom-0 [&>td]:z-10 [&>td]:bg-card [&>td]:border-t-2 [&>td]:border-border">
                  <td className="py-2 pl-3 sm:pl-4" colSpan={storeFilter === 'all' ? 6 : 5}>
                    合計
                  </td>
                  <td className="py-2 pr-3 sm:pr-4 text-right tabular-nums" colSpan={2}>
                    {formatCurrency(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

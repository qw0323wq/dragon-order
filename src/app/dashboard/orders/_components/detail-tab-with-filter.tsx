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
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            storeFilter === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          全部 ({details.length})
        </button>
        {storeNames.map((name) => {
          const count = details.filter((d) => d.storeName === name).length;
          return (
            <button
              key={name}
              onClick={() => setStoreFilter(name)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                storeFilter === name
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {name} ({count})
            </button>
          );
        })}
      </div>
      <Card>
        <CardContent className="pt-4 px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left py-2 pl-4 font-normal">品項</th>
                  <th className="text-left py-2 font-normal">叫貨人</th>
                  {storeFilter === 'all' && <th className="text-left py-2 font-normal">門市</th>}
                  <th className="text-left py-2 font-normal">供應商</th>
                  <th className="text-right py-2 font-normal">數量</th>
                  <th className="text-left py-2 font-normal">單位</th>
                  <th className="text-right py-2 font-normal">單價</th>
                  <th className="text-right py-2 pr-4 font-normal">小計</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className="border-b border-border/50">
                    <td className="py-2 pl-4 font-medium">{d.itemName}</td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {d.createdByName || '—'}
                    </td>
                    {storeFilter === 'all' && (
                      <td className="py-2 text-xs text-muted-foreground">{d.storeName}</td>
                    )}
                    <td className="py-2 text-xs text-muted-foreground">{d.supplierName}</td>
                    <td className="py-2 text-right tabular-nums">{parseFloat(d.quantity)}</td>
                    <td className="py-2 text-xs text-muted-foreground">{d.unit}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      ${d.unitPrice}
                    </td>
                    <td className="py-2 text-right tabular-nums pr-4">${d.subtotal}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border font-semibold">
                  <td className="py-2 pl-4" colSpan={storeFilter === 'all' ? 6 : 5}>
                    合計
                  </td>
                  <td className="py-2 text-right pr-4" colSpan={2}>
                    {formatCurrency(total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

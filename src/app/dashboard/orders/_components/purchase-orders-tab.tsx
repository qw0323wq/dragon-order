'use client';

/**
 * 叫貨單 Tab — 從訂單自動拆單 + 複製/下載/列印
 * 自包 state (pos, generating, copiedId) + handlers (fetchPOs, handleGenerate, copyPOText, downloadPOText, printPO)
 *
 * 上層只負責傳 selectedDate；切換到此 tab 時會自動 fetch
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, FileText, Download, Printer } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDisplay } from './types';
import type { POItem, PurchaseOrder } from './types';

interface PurchaseOrdersTabProps {
  selectedDate: string;
}

export function PurchaseOrdersTab({ selectedDate }: PurchaseOrdersTabProps) {
  const [pos, setPOs] = useState<PurchaseOrder[]>([]);
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const fetchPOs = useCallback(async () => {
    try {
      const res = await fetch(`/api/purchase-orders?date=${selectedDate}`);
      const data = await res.json();
      setPOs(data.purchaseOrders || []);
    } catch {
      // silent
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchPOs();
  }, [fetchPOs]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || '產生失敗');
        return;
      }
      toast.success(data.message);
      fetchPOs();
    } catch {
      toast.error('產生失敗');
    } finally {
      setGenerating(false);
    }
  }

  async function copyPOText(po: PurchaseOrder) {
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}?export=1`);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopiedId(po.id);
      toast.success(`已複製 ${po.supplierName} 叫貨單`);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('複製失敗');
    }
  }

  async function downloadPOText(po: PurchaseOrder) {
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}?export=1`);
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${po.poNumber}_${po.supplierName}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`已下載 ${po.supplierName} 叫貨單`);
    } catch {
      toast.error('下載失敗');
    }
  }

  /**
   * 列印正式叫貨單（參考 Costflows PO 文件版式，2026-07-17 升級）
   * 頁首品牌區 + PO 號 + 資訊欄 + 序號明細表 + 簽收欄；維持無價格（給供應商）。
   */
  function printPO(po: PurchaseOrder) {
    const { storeNames, grouped } = groupPOItems(po.items);
    const hasNotes = grouped.some((g) => g.notes);
    const deliveryDisplay = formatDisplay(selectedDate);
    const printedAt = new Date().toLocaleString('zh-TW', { hour12: false });

    const storeHeaders = storeNames
      .map((s) => `<th class="c">${s}</th>`)
      .join('');
    const rows = grouped
      .map((g, idx) => {
        const storeCells = storeNames
          .map((s) => `<td class="c">${g.stores[s] || ''}</td>`)
          .join('');
        return `<tr>
        <td class="c muted">${idx + 1}</td>
        <td class="name">${g.itemName}</td>
        ${storeCells}
        <td class="c total">${g.total}</td>
        <td class="c">${g.itemUnit}</td>
        ${hasNotes ? `<td class="notes">${g.notes || ''}</td>` : ''}
      </tr>`;
      })
      .join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${po.poNumber} - ${po.supplierName}</title>
      <style>
        *{box-sizing:border-box}
        body{font-family:"PingFang TC","Noto Sans TC",sans-serif;padding:28px;max-width:820px;margin:0 auto;color:#1a1a1a}
        .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #b91c1c;padding-bottom:14px}
        .brand{font-size:22px;font-weight:800;letter-spacing:1px}
        .brand small{display:block;font-size:12px;color:#888;font-weight:400;letter-spacing:2px;margin-top:2px}
        .doc{text-align:right}
        .doc .t{font-size:18px;font-weight:700}
        .doc .no{font-size:14px;color:#b91c1c;font-weight:600;margin-top:2px}
        .info{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px 24px;margin:16px 0 4px;font-size:13px}
        .info b{display:block;color:#888;font-weight:500;font-size:11px;margin-bottom:1px}
        table{width:100%;border-collapse:collapse;margin-top:14px;font-size:13px}
        th{background:#f7f7f7;padding:7px 6px;border:1px solid #d9d9d9;font-size:12px;text-align:left}
        td{padding:7px 6px;border:1px solid #d9d9d9;vertical-align:top}
        .c{text-align:center}
        .muted{color:#999;width:34px}
        .name{font-weight:600}
        .total{font-weight:800}
        .notes{font-size:12px;color:#555}
        .sign{display:flex;gap:48px;margin-top:36px;font-size:13px}
        .sign div{flex:1}
        .sign .line{border-bottom:1px solid #999;height:38px;margin-top:6px}
        .foot{margin-top:28px;padding-top:10px;border-top:1px solid #eee;color:#aaa;font-size:11px;display:flex;justify-content:space-between}
        @media print{body{padding:10px}}
      </style></head><body>
      <div class="head">
        <div class="brand">肥龍老火鍋<small>FEI LONG HOTPOT · 採購部</small></div>
        <div class="doc">
          <div class="t">叫貨單 Purchase Order</div>
          <div class="no">${po.poNumber}</div>
        </div>
      </div>
      <div class="info">
        <div><b>供應商</b>${po.supplierName}</div>
        <div><b>送貨日期</b>${deliveryDisplay}</div>
        <div><b>品項數</b>${grouped.length} 項</div>
      </div>
      <table><thead><tr>
        <th class="c">#</th><th>品名</th>${storeHeaders}
        <th class="c">合計</th><th class="c">單位</th>
        ${hasNotes ? '<th>備註</th>' : ''}
      </tr></thead><tbody>${rows}</tbody></table>
      <div class="sign">
        <div>供應商出貨確認<div class="line"></div></div>
        <div>門市驗收簽名<div class="line"></div></div>
      </div>
      <div class="foot">
        <span>肥龍老火鍋 採購系統</span>
        <span>${po.poNumber} · 列印於 ${printedAt}</span>
      </div>
      <script>window.onload=()=>window.print()</script></body></html>`;

    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleGenerate} disabled={generating} className="gap-1.5">
          {generating ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
          {generating ? '產生中...' : '產生叫貨單'}
        </Button>
      </div>

      {pos.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <FileText className="size-8 mx-auto mb-2 opacity-50" />
            <p>尚無叫貨單，按「產生叫貨單」從訂單自動拆單</p>
          </CardContent>
        </Card>
      ) : (
        pos.map((po) => {
          const { storeNames, grouped } = groupPOItems(po.items);
          const stColor =
            po.status === 'draft'
              ? 'bg-yellow-100 text-yellow-700'
              : po.status === 'confirmed'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-green-100 text-green-700';
          return (
            <Card key={po.id}>
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{po.supplierName}</span>
                  <Badge className={stColor}>
                    {po.status === 'draft'
                      ? '待確認'
                      : po.status === 'confirmed'
                      ? '已確認'
                      : '已送出'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{grouped.length} 品項</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 text-xs h-7 px-2"
                    onClick={() => copyPOText(po)}
                  >
                    {copiedId === po.id ? '✓ 已複製' : '複製'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 text-xs h-7 px-2"
                    onClick={() => downloadPOText(po)}
                    title="下載文字檔"
                  >
                    <Download className="size-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 text-xs h-7 px-2"
                    onClick={() => printPO(po)}
                    title="列印/存PDF"
                  >
                    <Printer className="size-3" />
                  </Button>
                </div>
              </div>
              <CardContent className="pt-0 px-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b">
                        <th className="text-left py-1.5 pl-4 font-normal">品名</th>
                        {storeNames.map((s) => (
                          <th key={s} className="text-center py-1.5 font-normal">
                            {s}
                          </th>
                        ))}
                        <th className="text-center py-1.5 font-semibold">合計</th>
                        <th className="text-left py-1.5 font-normal">單位</th>
                        {grouped.some((g) => g.notes) && (
                          <th className="text-left py-1.5 font-normal">備註</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {grouped.map((g) => (
                        <tr key={g.itemName} className="border-b border-border/50">
                          <td className="py-1.5 pl-4 font-medium">{g.itemName}</td>
                          {storeNames.map((s) => (
                            <td key={s} className="text-center">
                              {g.stores[s] || ''}
                            </td>
                          ))}
                          <td className="text-center font-semibold">{g.total}</td>
                          <td className="text-xs text-muted-foreground">{g.itemUnit}</td>
                          {grouped.some((gg) => gg.notes) && (
                            <td className="text-xs text-muted-foreground">{g.notes || ''}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

function groupPOItems(poItems: POItem[]) {
  const storeNames = [...new Set(poItems.map((i) => i.storeName))].sort();
  const map = new Map<
    string,
    {
      itemName: string;
      itemUnit: string;
      notes: string | null;
      costPrice: number;
      stores: Record<string, number>;
      total: number;
    }
  >();
  for (const pi of poItems) {
    const key = pi.itemName;
    if (!map.has(key)) {
      map.set(key, {
        itemName: pi.itemName,
        itemUnit: pi.itemUnit,
        notes: pi.notes,
        costPrice: pi.costPrice,
        stores: {},
        total: 0,
      });
    }
    const entry = map.get(key)!;
    const qty = parseFloat(pi.quantity) || 0;
    entry.stores[pi.storeName] = (entry.stores[pi.storeName] || 0) + qty;
    entry.total += qty;
  }
  return { storeNames, grouped: [...map.values()] };
}

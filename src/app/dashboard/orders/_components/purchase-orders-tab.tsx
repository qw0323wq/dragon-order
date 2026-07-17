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
import { buildPoHtml, type PoTemplateItem } from '@/lib/po-template';
import type { POItem, PurchaseOrder } from './types';

interface PurchaseOrdersTabProps {
  selectedDate: string;
}

export function PurchaseOrdersTab({ selectedDate }: PurchaseOrdersTabProps) {
  const [pos, setPOs] = useState<PurchaseOrder[]>([]);
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

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

  /** 下載 PDF（伺服器渲染，版式同列印；手機下載後可直接 LINE 傳給供應商） */
  async function downloadPOPdf(po: PurchaseOrder) {
    setDownloadingId(po.id);
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}/pdf`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'PDF 產生失敗');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${po.poNumber}_${po.supplierName}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`已下載 ${po.supplierName} 叫貨單 PDF`);
    } catch {
      toast.error('下載失敗');
    } finally {
      setDownloadingId(null);
    }
  }

  /**
   * 列印正式叫貨單 — 版式來自共用模板 lib/po-template.ts（與 PDF API 同一份）
   */
  function printPO(po: PurchaseOrder) {
    const templateItems: PoTemplateItem[] = po.items.map((pi) => ({
      itemName: pi.itemName,
      unit: pi.itemUnit,
      storeName: pi.storeName,
      quantity: parseFloat(pi.quantity) || 0,
      notes: pi.notes,
    }));
    const html = buildPoHtml(
      {
        poNumber: po.poNumber,
        supplierName: po.supplierName,
        deliveryDate: selectedDate,
        items: templateItems,
      },
      { autoPrint: true }
    );

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
                    onClick={() => downloadPOPdf(po)}
                    disabled={downloadingId === po.id}
                    title="下載 PDF"
                  >
                    {downloadingId === po.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <>
                        <Download className="size-3" /> PDF
                      </>
                    )}
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

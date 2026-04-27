'use client';

/**
 * 訂單付款明細表格
 *
 * 訂單 × 供應商 grain — 每張訂單一行（一張單跨多家供應商會拆多行）
 *
 * 操作：
 *   - 單張勾選 / 全選 / 取消選取
 *   - inline「標記已付」按鈕：點下去會在同一行展開日期 input + 確認/取消
 *   - 已付的可以再點修改匯款日期或取消已付
 *   - 批次：勾選多張 → 上方 action bar 出現 → 選日期 → 一鍵全標記
 */
import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { CreditCard, CheckCircle2, Loader2, X, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCurrency as fmtAmount, formatDateLocal } from '@/lib/format';
import type { OrderPaymentRow } from './types';

interface OrderPaymentListProps {
  orders: OrderPaymentRow[];
  /** 標題用 — '月結' / '現結' */
  paymentType: '月結' | '現結';
  /** 操作後重新載入報表 */
  onReload: () => Promise<void>;
}

/** key = `${orderId}-${supplierId}` */
function rowKey(o: OrderPaymentRow): string {
  return `${o.orderId}-${o.supplierId}`;
}

/** YYYY-MM-DD → YYYY/MM/DD（週X） */
function formatOrderDate(d: string): string {
  const date = new Date(d + 'T00:00:00');
  const w = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
  return `${d.slice(5).replace('-', '/')}（${w}）`;
}

export function OrderPaymentList({ orders, paymentType, onReload }: OrderPaymentListProps) {
  // 過濾出該 paymentType 的訂單
  const filtered = useMemo(
    () => orders.filter((o) => o.paymentType === paymentType),
    [orders, paymentType]
  );

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  /** 哪一列正在 inline 編輯（key=rowKey） */
  const [editingKey, setEditingKey] = useState<string | null>(null);
  /** 每列的日期 input 暫存（key=rowKey） */
  const [paidAtInputs, setPaidAtInputs] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const today = formatDateLocal();
  const [batchPaidAt, setBatchPaidAt] = useState(today);

  if (filtered.length === 0) return null;

  function toggleSelect(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // 可勾選 = 該 paymentType + 未結清（未付/處理中）
  const selectable = filtered.filter((o) => o.paymentStatus !== 'paid');
  const allSelected =
    selectable.length > 0 &&
    selectable.every((o) => selectedKeys.has(rowKey(o)));
  const someSelected = selectable.some((o) => selectedKeys.has(rowKey(o)));

  function toggleAll() {
    if (allSelected) {
      const next = new Set(selectedKeys);
      for (const o of selectable) next.delete(rowKey(o));
      setSelectedKeys(next);
    } else {
      const next = new Set(selectedKeys);
      for (const o of selectable) next.add(rowKey(o));
      setSelectedKeys(next);
    }
  }

  /** 單筆：標記已付 / 取消已付 / 改日期 */
  async function postUpsert(o: OrderPaymentRow, status: 'paid' | 'unpaid', paidAt?: string) {
    const key = rowKey(o);
    setSubmitting(key);
    try {
      // amount 用應付金額（未驗收完則 fallback 採購金額）
      const amount = o.payableAmount ?? o.totalAmount;
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{
            orderId: o.orderId,
            supplierId: o.supplierId,
            amount,
            status,
            paidAt: status === 'paid' ? paidAt : undefined,
            paymentType: o.paymentType,
          }],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || '操作失敗');
        return;
      }
      toast.success(
        status === 'paid'
          ? `已標記 ${o.supplierName} ${formatOrderDate(o.orderDate)} 付款`
          : `已取消 ${o.supplierName} ${formatOrderDate(o.orderDate)} 付款`
      );
      setEditingKey(null);
      await onReload();
    } catch {
      toast.error('發生錯誤');
    } finally {
      setSubmitting(null);
    }
  }

  /** 批次標記已付 */
  async function handleBatchMarkPaid() {
    if (selectedKeys.size === 0) return;
    const selectedOrders = filtered.filter((o) => selectedKeys.has(rowKey(o)));
    if (selectedOrders.length === 0) return;

    setBatchSubmitting(true);
    try {
      const items = selectedOrders.map((o) => ({
        orderId: o.orderId,
        supplierId: o.supplierId,
        amount: o.payableAmount ?? o.totalAmount,
        status: 'paid' as const,
        paidAt: batchPaidAt,
        paymentType: o.paymentType,
      }));
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || '批次標記失敗');
        return;
      }
      const data = await res.json();
      toast.success(`已標記 ${data.count} 筆付款（匯款日 ${batchPaidAt}）`);
      setSelectedKeys(new Set());
      await onReload();
    } catch {
      toast.error('發生錯誤');
    } finally {
      setBatchSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">{paymentType}訂單明細</CardTitle>
          <Badge
            className={
              paymentType === '月結'
                ? 'bg-blue-100 text-blue-700 border-blue-200'
                : 'bg-orange-100 text-orange-700 border-orange-200'
            }
          >
            {filtered.length} 張
          </Badge>
        </div>
      </CardHeader>

      {/* 批次 Action Bar — 有勾選時浮現 */}
      {selectedKeys.size > 0 && (
        <div className="bg-primary/5 border-b border-primary/20 px-4 py-3 flex flex-wrap items-center gap-3 print:hidden">
          <span className="text-sm font-semibold">已選 {selectedKeys.size} 筆</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">匯款日期</span>
            <Input
              type="date"
              value={batchPaidAt}
              onChange={(e) => setBatchPaidAt(e.target.value)}
              className="h-8 w-36 text-sm"
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <Button variant="ghost" size="sm" onClick={() => setSelectedKeys(new Set())}>
              取消選取
            </Button>
            <Button
              size="sm"
              disabled={batchSubmitting || !batchPaidAt}
              onClick={handleBatchMarkPaid}
            >
              {batchSubmitting ? (
                <>
                  <Loader2 className="size-3 animate-spin mr-1" /> 處理中...
                </>
              ) : (
                <>批次標記已付</>
              )}
            </Button>
          </div>
        </div>
      )}

      <CardContent className="pt-3 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 print:hidden">
                <input
                  type="checkbox"
                  aria-label="全選未結清訂單"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
                  onChange={toggleAll}
                  className="size-4 accent-primary cursor-pointer"
                  disabled={selectable.length === 0}
                />
              </TableHead>
              <TableHead>訂單日期</TableHead>
              <TableHead>供應商</TableHead>
              <TableHead className="text-right">採購金額</TableHead>
              <TableHead className="text-right">應付金額</TableHead>
              <TableHead className="text-right">已付/匯款日</TableHead>
              <TableHead className="print:hidden">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((o) => {
              const key = rowKey(o);
              const isPaid = o.paymentStatus === 'paid';
              const isEditing = editingKey === key;
              const isThisSubmitting = submitting === key;
              const checked = selectedKeys.has(key);
              return (
                <TableRow key={key} className={isPaid ? 'opacity-70' : ''}>
                  <TableCell className="print:hidden">
                    {!isPaid && (
                      <input
                        type="checkbox"
                        aria-label={`選取 ${o.supplierName} ${o.orderDate}`}
                        checked={checked}
                        onChange={() => toggleSelect(key)}
                        className="size-4 accent-primary cursor-pointer"
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatOrderDate(o.orderDate)}
                  </TableCell>
                  <TableCell className="font-medium">{o.supplierName}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {fmtAmount(o.totalAmount)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {o.payableAmount === null ? (
                      <span className="text-muted-foreground text-xs">未驗收</span>
                    ) : (
                      <span className={o.payableAmount !== o.totalAmount ? 'text-orange-600' : ''}>
                        {fmtAmount(o.payableAmount)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {isPaid ? (
                      <span className="text-green-600">
                        {fmtAmount(o.paidAmount)}
                        {o.paidAt && (
                          <span className="text-muted-foreground text-xs ml-1">/ {o.paidAt}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </TableCell>
                  <TableCell className="print:hidden">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <Input
                          type="date"
                          value={paidAtInputs[key] ?? today}
                          onChange={(e) =>
                            setPaidAtInputs((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          className="h-7 text-xs w-32"
                        />
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs px-2"
                          disabled={isThisSubmitting}
                          onClick={() => postUpsert(o, 'paid', paidAtInputs[key] ?? today)}
                        >
                          {isThisSubmitting ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            '確認'
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs px-1"
                          onClick={() => setEditingKey(null)}
                          disabled={isThisSubmitting}
                        >
                          <X className="size-3" />
                        </Button>
                      </div>
                    ) : isPaid ? (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1 text-muted-foreground"
                          onClick={() => {
                            setPaidAtInputs((prev) => ({
                              ...prev,
                              [key]: o.paidAt ?? today,
                            }));
                            setEditingKey(key);
                          }}
                          title="修改匯款日期"
                        >
                          <CheckCircle2 className="size-3 text-green-600" />
                          已付
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs px-1.5 text-orange-600"
                          disabled={isThisSubmitting}
                          onClick={() => postUpsert(o, 'unpaid')}
                          title="取消付款"
                        >
                          {isThisSubmitting ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <RotateCcw className="size-3" />
                          )}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => {
                          setPaidAtInputs((prev) => ({ ...prev, [key]: today }));
                          setEditingKey(key);
                        }}
                      >
                        <CreditCard className="size-3" />
                        標記已付
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

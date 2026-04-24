'use client';

/**
 * 總公司模式：按結帳方式（月結/現結）分組的供應商帳務表格
 * - 月結表格含 checkbox 支援 P2-B5 批次付款（prop: selectedIds + onToggleSelect）
 * - 現結表格不顯示 checkbox
 * - 每行有「標記已付」按鈕（單家付款）+ 「已結清」/「待付款」狀態
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2, CheckCircle2, CreditCard, AlertCircle } from 'lucide-react';
import { formatCurrency as fmtAmount, sumBy } from '@/lib/format';
import type { SupplierPaymentReport } from './types';

interface HQTableProps {
  suppliers: SupplierPaymentReport[];
  paymentType: '月結' | '現結';
  markingPaid: number | null;
  onMarkPaid: (supplierId: number, supplierName: string, amount: number) => void;
  // P2-B5 批次付款（僅月結用；現結不需要）
  selectedIds?: Set<number>;
  onToggleSelect?: (supplierId: number) => void;
}

export function HQSupplierTable({
  suppliers,
  paymentType,
  markingPaid,
  onMarkPaid,
  selectedIds,
  onToggleSelect,
}: HQTableProps) {
  if (suppliers.length === 0) return null;

  const isMonthly = paymentType === '月結';
  const subtotalAmount = sumBy(suppliers, r => r.totalAmount);
  const subtotalPaid = sumBy(suppliers, r => r.paidAmount);
  const subtotalUnpaid = sumBy(suppliers, r => r.unpaidAmount);

  // 可勾選的供應商（月結 + 未結清）
  const selectable = isMonthly ? suppliers.filter((s) => s.unpaidAmount > 0) : [];
  const allSelected =
    selectable.length > 0 && selectable.every((s) => selectedIds?.has(s.supplierId));
  const someSelected = selectable.some((s) => selectedIds?.has(s.supplierId));

  function toggleAll() {
    if (!onToggleSelect) return;
    if (allSelected) {
      for (const s of selectable) if (selectedIds?.has(s.supplierId)) onToggleSelect(s.supplierId);
    } else {
      for (const s of selectable) if (!selectedIds?.has(s.supplierId)) onToggleSelect(s.supplierId);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">{paymentType}供應商</CardTitle>
          <Badge
            className={
              isMonthly
                ? 'bg-blue-100 text-blue-700 border-blue-200'
                : 'bg-orange-100 text-orange-700 border-orange-200'
            }
          >
            {suppliers.length} 家
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-3 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {isMonthly && onToggleSelect && (
                <TableHead className="w-8 print:hidden">
                  <input
                    type="checkbox"
                    aria-label="全選月結未結清供應商"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
                    onChange={toggleAll}
                    className="size-4 accent-primary cursor-pointer"
                    disabled={selectable.length === 0}
                  />
                </TableHead>
              )}
              <TableHead>供應商</TableHead>
              <TableHead>結帳方式</TableHead>
              <TableHead className="text-center">訂單筆數</TableHead>
              <TableHead className="text-right">總金額</TableHead>
              <TableHead className="text-right">已付</TableHead>
              <TableHead className="text-right">未付</TableHead>
              <TableHead className="print:hidden">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((s) => {
              const isFullyPaid = s.unpaidAmount === 0;
              return (
                <TableRow key={s.supplierId} className={isFullyPaid ? 'opacity-60' : ''}>
                  {isMonthly && onToggleSelect && (
                    <TableCell className="print:hidden">
                      {!isFullyPaid && (
                        <input
                          type="checkbox"
                          aria-label={`選取 ${s.supplierName}`}
                          checked={selectedIds?.has(s.supplierId) ?? false}
                          onChange={() => onToggleSelect(s.supplierId)}
                          className="size-4 accent-primary cursor-pointer"
                        />
                      )}
                    </TableCell>
                  )}
                  <TableCell className="font-medium">{s.supplierName}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {s.paymentType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center text-sm">{s.orderCount} 筆</TableCell>
                  <TableCell className="text-right font-semibold">
                    {fmtAmount(s.totalAmount)}
                  </TableCell>
                  <TableCell className="text-right text-green-600">
                    {fmtAmount(s.paidAmount)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-semibold ${
                      s.unpaidAmount > 0 ? 'text-red-600' : 'text-muted-foreground'
                    }`}
                  >
                    {fmtAmount(s.unpaidAmount)}
                  </TableCell>
                  <TableCell className="print:hidden">
                    {isFullyPaid ? (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="size-3.5" />
                        已結清
                      </span>
                    ) : isMonthly ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        disabled={markingPaid === s.supplierId}
                        onClick={() => onMarkPaid(s.supplierId, s.supplierName, s.unpaidAmount)}
                      >
                        {markingPaid === s.supplierId ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <CreditCard className="size-3" />
                        )}
                        標記已付
                      </Button>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-orange-600">
                        <AlertCircle className="size-3.5" />
                        待付款
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {/* 小計列 */}
            <TableRow className={`font-semibold ${isMonthly ? 'bg-blue-50/50' : 'bg-orange-50/50'}`}>
              <TableCell colSpan={3}>{paymentType}小計</TableCell>
              <TableCell className="text-right">{fmtAmount(subtotalAmount)}</TableCell>
              <TableCell className="text-right text-green-600">{fmtAmount(subtotalPaid)}</TableCell>
              <TableCell className="text-right text-red-600">{fmtAmount(subtotalUnpaid)}</TableCell>
              <TableCell className="print:hidden" />
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

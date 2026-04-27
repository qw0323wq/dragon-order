'use client';

/**
 * 總公司模式：按結帳方式（月結/現結）分組的供應商總覽
 *
 * 純檢視 — 顯示該方式下所有供應商的採購/應付/已付/未付小計
 * 操作（標記已付）改在 OrderPaymentList（訂單級別）
 *
 * 重構（2026-04-28）：移除 batch checkbox + 標記已付按鈕，操作改到訂單 grain
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { formatCurrency as fmtAmount, sumBy } from '@/lib/format';
import type { SupplierPaymentReport } from './types';

interface HQTableProps {
  suppliers: SupplierPaymentReport[];
  paymentType: '月結' | '現結';
}

export function HQSupplierTable({ suppliers, paymentType }: HQTableProps) {
  if (suppliers.length === 0) return null;

  const isMonthly = paymentType === '月結';
  const subtotalAmount = sumBy(suppliers, r => r.totalAmount);
  // 應付小計：未驗收的 fallback 用採購金額（避免低估）
  const subtotalPayable = sumBy(suppliers, r => r.payableAmount ?? r.totalAmount);
  const subtotalPaid = sumBy(suppliers, r => r.paidAmount);
  const subtotalUnpaid = sumBy(suppliers, r => r.unpaidAmount);

  return (
    <Card>
      <CardHeader className="border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">{paymentType}供應商總覽</CardTitle>
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
              <TableHead>供應商</TableHead>
              <TableHead className="text-center">訂單筆數</TableHead>
              <TableHead className="text-right">採購金額</TableHead>
              <TableHead className="text-right">應付金額</TableHead>
              <TableHead className="text-right">已付</TableHead>
              <TableHead className="text-right">未付</TableHead>
              <TableHead className="print:hidden">狀態</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((s) => {
              const isFullyPaid = s.unpaidAmount === 0;
              return (
                <TableRow key={s.supplierId} className={isFullyPaid ? 'opacity-70' : ''}>
                  <TableCell className="font-medium">{s.supplierName}</TableCell>
                  <TableCell className="text-center text-sm">{s.orderCount} 筆</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {fmtAmount(s.totalAmount)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {s.payableAmount === null ? (
                      <span className="text-muted-foreground text-xs">未驗收</span>
                    ) : (
                      <span className={s.payableAmount !== s.totalAmount ? 'text-orange-600' : ''}>
                        {fmtAmount(s.payableAmount)}
                      </span>
                    )}
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
              <TableCell colSpan={2}>{paymentType}小計</TableCell>
              <TableCell className="text-right text-muted-foreground">{fmtAmount(subtotalAmount)}</TableCell>
              <TableCell className="text-right">{fmtAmount(subtotalPayable)}</TableCell>
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

'use client';

/**
 * 門市模式：該門市該月所有供應商採購明細（無標記付款操作，僅檢視 + 列印）
 */

import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCurrency as fmtAmount, sumBy } from '@/lib/format';
import type { SupplierPaymentReport } from './types';

interface StoreTableProps {
  suppliers: SupplierPaymentReport[];
}

export function StoreSupplierTable({ suppliers }: StoreTableProps) {
  if (suppliers.length === 0) return null;

  const subtotalAmount = sumBy(suppliers, r => r.totalAmount);
  // 應付小計：未驗收 fallback 採購金額
  const subtotalPayable = sumBy(suppliers, r => r.payableAmount ?? r.totalAmount);
  const subtotalPaid = sumBy(suppliers, r => r.paidAmount);
  const subtotalUnpaid = sumBy(suppliers, r => r.unpaidAmount);

  return (
    <Card>
      <CardContent className="pt-4 overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              <TableHead>供應商</TableHead>
              <TableHead className="text-right">訂單筆數</TableHead>
              <TableHead className="text-right">採購金額</TableHead>
              <TableHead className="text-right">應付金額</TableHead>
              <TableHead className="text-right">已付</TableHead>
              <TableHead className="text-right">未付</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((s) => {
              const isFullyPaid = s.unpaidAmount === 0;
              return (
                <TableRow
                  key={s.supplierId}
                  className={`hover:bg-muted/30 ${isFullyPaid ? 'opacity-60' : ''}`}
                >
                  <TableCell className="font-medium">{s.supplierName}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{s.orderCount} 筆</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {fmtAmount(s.totalAmount)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {s.payableAmount === null ? (
                      <span className="text-muted-foreground text-xs">未驗收</span>
                    ) : (
                      <span className={s.payableAmount !== s.totalAmount ? 'text-orange-600' : ''}>
                        {fmtAmount(s.payableAmount)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-green-600">
                    {fmtAmount(s.paidAmount)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-semibold tabular-nums ${
                      s.unpaidAmount > 0 ? 'text-red-600' : 'text-muted-foreground'
                    }`}
                  >
                    {fmtAmount(s.unpaidAmount)}
                  </TableCell>
                </TableRow>
              );
            })}
            {/* 合計列 */}
            <TableRow className="bg-muted/40 font-bold hover:bg-muted/40">
              <TableCell colSpan={2}>合計</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{fmtAmount(subtotalAmount)}</TableCell>
              <TableCell className="text-right tabular-nums text-primary">{fmtAmount(subtotalPayable)}</TableCell>
              <TableCell className="text-right tabular-nums text-green-600">{fmtAmount(subtotalPaid)}</TableCell>
              <TableCell className="text-right tabular-nums text-red-600">{fmtAmount(subtotalUnpaid)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

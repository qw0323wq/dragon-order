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
          <TableHeader>
            <TableRow>
              <TableHead>供應商</TableHead>
              <TableHead className="text-center">訂單筆數</TableHead>
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
                <TableRow key={s.supplierId} className={isFullyPaid ? 'opacity-60' : ''}>
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
                </TableRow>
              );
            })}
            {/* 合計列 */}
            <TableRow className="bg-muted/40 font-bold">
              <TableCell colSpan={2}>合計</TableCell>
              <TableCell className="text-right text-muted-foreground">{fmtAmount(subtotalAmount)}</TableCell>
              <TableCell className="text-right text-primary">{fmtAmount(subtotalPayable)}</TableCell>
              <TableCell className="text-right text-green-600">{fmtAmount(subtotalPaid)}</TableCell>
              <TableCell className="text-right text-red-600">{fmtAmount(subtotalUnpaid)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

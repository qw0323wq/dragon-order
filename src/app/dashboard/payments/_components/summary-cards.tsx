'use client';

/**
 * 帳務頁頂部摘要卡片：採購總金額 / 已付金額 / 未付金額
 */

import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency as fmtAmount } from '@/lib/format';

interface SummaryCardsProps {
  totalAmount: number;
  paidAmount: number;
  unpaidAmount: number;
}

export function SummaryCards({ totalAmount, paidAmount, unpaidAmount }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-3 gap-3 print:gap-2">
      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">採購總金額</p>
          <p className="text-lg font-bold text-primary font-heading">
            {fmtAmount(totalAmount)}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">已付金額</p>
          <p className="text-lg font-bold text-green-600 font-heading">
            {fmtAmount(paidAmount)}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">未付金額</p>
          <p
            className={`text-lg font-bold font-heading ${
              unpaidAmount > 0 ? 'text-red-600' : 'text-muted-foreground'
            }`}
          >
            {fmtAmount(unpaidAmount)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

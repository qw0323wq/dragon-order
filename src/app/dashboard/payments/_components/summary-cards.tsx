'use client';

/**
 * 帳務頁頂部摘要卡片：採購 / 應付 / 已付 / 未付
 *
 * 採購金額：按訂購量 × 單價；應付：按實收 - 退貨（未驗收 fallback 採購）
 */

import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency as fmtAmount } from '@/lib/format';

interface SummaryCardsProps {
  totalAmount: number;
  payableAmount: number;
  paidAmount: number;
  unpaidAmount: number;
}

export function SummaryCards({ totalAmount, payableAmount, paidAmount, unpaidAmount }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:gap-2">
      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">採購金額</p>
          <p className="text-lg font-bold text-primary font-heading">
            {fmtAmount(totalAmount)}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4 pb-3">
          <p className="text-xs text-muted-foreground">應付金額</p>
          <p className={`text-lg font-bold font-heading ${
            payableAmount !== totalAmount ? 'text-orange-600' : 'text-primary'
          }`}>
            {fmtAmount(payableAmount)}
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

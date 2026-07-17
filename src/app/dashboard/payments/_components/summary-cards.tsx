'use client';

/**
 * 帳務頁頂部摘要卡片：採購 / 應付 / 已付 / 未付
 *
 * 採購金額：按訂購量 × 單價；應付：按實收 - 退貨（未驗收 fallback 採購）
 *
 * 語意色：採購=品牌紅、應付=橘（有驗收差異時）、已付=綠、未付=紅（未結清時）
 */

import { ShoppingCart, Receipt, CheckCircle2, AlertCircle } from 'lucide-react';
import { StatCard } from '@/components/ui/stat-card';
import { formatCurrency as fmtAmount } from '@/lib/format';

interface SummaryCardsProps {
  totalAmount: number;
  payableAmount: number;
  paidAmount: number;
  unpaidAmount: number;
}

export function SummaryCards({ totalAmount, payableAmount, paidAmount, unpaidAmount }: SummaryCardsProps) {
  // 應付 ≠ 採購 → 有驗收差異（短收/退貨），用橘色提示
  const hasDiff = payableAmount !== totalAmount;
  const isSettled = unpaidAmount === 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:gap-2">
      <StatCard
        label="採購金額"
        value={<span className="text-primary">{fmtAmount(totalAmount)}</span>}
        icon={ShoppingCart}
        accent="bg-red-100 text-red-600"
        hint="按訂購量 × 單價"
      />
      <StatCard
        label="應付金額"
        value={
          <span className={hasDiff ? 'text-orange-600' : 'text-primary'}>
            {fmtAmount(payableAmount)}
          </span>
        }
        icon={Receipt}
        accent="bg-orange-100 text-orange-600"
        hint={hasDiff ? '按實收 − 退貨' : '與採購金額相符'}
      />
      <StatCard
        label="已付金額"
        value={<span className="text-green-600">{fmtAmount(paidAmount)}</span>}
        icon={CheckCircle2}
        accent="bg-green-100 text-green-600"
        hint={isSettled ? '本月已結清' : undefined}
      />
      <StatCard
        label="未付金額"
        value={
          <span className={unpaidAmount > 0 ? 'text-red-600' : 'text-muted-foreground'}>
            {fmtAmount(unpaidAmount)}
          </span>
        }
        icon={AlertCircle}
        accent={unpaidAmount > 0 ? 'bg-red-100 text-red-600' : 'bg-muted text-muted-foreground'}
        hint={unpaidAmount > 0 ? '尚有帳款待付' : undefined}
      />
    </div>
  );
}

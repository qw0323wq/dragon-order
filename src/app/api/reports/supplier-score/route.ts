/**
 * 供應商評分 API
 * GET /api/reports/supplier-score?months=3
 *
 * 評分維度：
 * 1. 準時率 = 有 receiving 紀錄且結果正常的 PO 比例
 * 2. 品質合格率 = receiving 結果非品質問題的比例
 * 3. 完整交貨率 = receiving 結果非短缺/未到貨的比例
 * 4. 總評分 = 加權平均
 */
import { NextRequest, NextResponse } from "next/server";
import { formatDateLocal } from '@/lib/format';
import { rawSql as sql } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";


export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const months = parseInt(searchParams.get("months") || "3");
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceStr = formatDateLocal(since);

  // 每個供應商的 PO 統計
  const poStats = await sql`
    SELECT
      po.supplier_id,
      s.name as supplier_name,
      s.category as supplier_category,
      COUNT(DISTINCT po.id) as total_pos,
      COUNT(DISTINCT CASE WHEN po.status IN ('received', 'closed') THEN po.id END) as completed_pos
    FROM purchase_orders po
    JOIN suppliers s ON po.supplier_id = s.id
    WHERE po.created_at >= ${sinceStr}::date
    GROUP BY po.supplier_id, s.name, s.category
  `;

  // 驗收統計
  const receivingStats = await sql`
    SELECT
      s.id as supplier_id,
      COUNT(r.id) as total_receiving,
      COUNT(CASE WHEN r.result = '正常' THEN 1 END) as normal_count,
      COUNT(CASE WHEN r.result = '品質問題' THEN 1 END) as quality_issue_count,
      COUNT(CASE WHEN r.result = '短缺' THEN 1 END) as shortage_count,
      COUNT(CASE WHEN r.result = '未到貨' THEN 1 END) as missing_count
    FROM receiving r
    JOIN order_items oi ON r.order_item_id = oi.id
    JOIN items i ON oi.item_id = i.id
    JOIN suppliers s ON i.supplier_id = s.id
    JOIN orders o ON oi.order_id = o.id
    WHERE o.created_at >= ${sinceStr}::date
    GROUP BY s.id
  `;

  // 帳務統計
  const paymentStats = await sql`
    SELECT
      supplier_id,
      COUNT(*) as total_payments,
      COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
      SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as total_paid
    FROM payments
    WHERE created_at >= ${sinceStr}::date
    GROUP BY supplier_id
  `;

  // 合併
  const receivingMap = new Map<number, typeof receivingStats[0]>();
  for (const r of receivingStats) receivingMap.set(r.supplier_id as number, r);

  const paymentMap = new Map<number, typeof paymentStats[0]>();
  for (const p of paymentStats) paymentMap.set(p.supplier_id as number, p);

  const suppliers = poStats.map((po) => {
    const sid = po.supplier_id as number;
    const recv = receivingMap.get(sid);
    const pay = paymentMap.get(sid);

    const totalReceiving = parseInt(recv?.total_receiving as string) || 0;
    const normalCount = parseInt(recv?.normal_count as string) || 0;
    const qualityIssues = parseInt(recv?.quality_issue_count as string) || 0;
    const shortages = parseInt(recv?.shortage_count as string) || 0;
    const missing = parseInt(recv?.missing_count as string) || 0;

    // 計算各指標（0-100）
    const qualityRate = totalReceiving > 0
      ? Math.round((1 - qualityIssues / totalReceiving) * 100)
      : 100; // 沒有驗收紀錄預設滿分

    const deliveryRate = totalReceiving > 0
      ? Math.round((1 - (shortages + missing) / totalReceiving) * 100)
      : 100;

    const completionRate = parseInt(po.total_pos as string) > 0
      ? Math.round((parseInt(po.completed_pos as string) / parseInt(po.total_pos as string)) * 100)
      : 0;

    // 總評分 = 品質40% + 交貨30% + 完成率30%
    const overallScore = Math.round(qualityRate * 0.4 + deliveryRate * 0.3 + completionRate * 0.3);

    return {
      supplierId: sid,
      supplierName: po.supplier_name,
      supplierCategory: po.supplier_category,
      totalPOs: parseInt(po.total_pos as string) || 0,
      completedPOs: parseInt(po.completed_pos as string) || 0,
      totalReceiving,
      scores: {
        quality: qualityRate,
        delivery: deliveryRate,
        completion: completionRate,
        overall: overallScore,
      },
      issues: {
        qualityIssues,
        shortages,
        missing,
      },
      payment: {
        totalPaid: parseInt(pay?.total_paid as string) || 0,
        paidCount: parseInt(pay?.paid_count as string) || 0,
      },
    };
  });

  // 排序：評分高的在前
  suppliers.sort((a, b) => b.scores.overall - a.scores.overall);

  return NextResponse.json({
    period: { months, since: sinceStr },
    suppliers,
    summary: {
      totalSuppliers: suppliers.length,
      avgScore: suppliers.length > 0
        ? Math.round(suppliers.reduce((s, r) => s + r.scores.overall, 0) / suppliers.length)
        : 0,
      lowScore: suppliers.filter((s) => s.scores.overall < 70).length,
    },
  });
}

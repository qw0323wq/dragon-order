"use client";

/**
 * 老闆採購規劃頁 — 食材本位採購工作流的決策中心
 *
 * 工作流：
 *   1. 員工側提叫貨需求 → 寫入 purchase_requests (status='pending')
 *   2. 老闆在這頁看到清單
 *   3. 點開需求看每個食材 → 系統推薦主家，下拉可切換廠商
 *   4. 確認後點「拆單產生訂單」→ 按廠商分組寫入 orders → 標記 processed
 *   5. 後續走既有訂單管理 + 驗收流程
 *
 * 也可以「直接建新需求」（老闆自己提，不等員工）
 */
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  AlertCircle,
  Trash2,
  Plus,
  Send,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";

interface RequestRow {
  id: number;
  store_id: number;
  store_name: string;
  request_date: string;
  status: string;
  creator_name: string | null;
  item_count: number;
  notes: string | null;
  created_at: string;
  order_ids: number[];
}

interface SkuOption {
  id: number;
  name: string;
  supplierId: number;
  supplierName: string;
  costPrice: number;
  unit: string;
  packSize: string | null;
  isPrimary: boolean;
  currentStock: number;
}

interface RequestItem {
  id: number;
  ingredient_id: number;
  ingredient_name: string;
  ingredient_category: string | null;
  ingredient_unit: string | null;
  currentStock: number | null;
  neededQty: number;
  unit: string | null;
  suggested_item_id: number | null;
  chosen_item_id: number | null;
  skuOptions: SkuOption[];
  notes: string | null;
}

interface RequestDetail {
  request: RequestRow;
  items: RequestItem[];
}

export default function PurchasePlanPage() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"pending" | "processed" | "cancelled">("pending");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailMap, setDetailMap] = useState<Map<number, RequestDetail>>(new Map());
  const [dispatching, setDispatching] = useState<number | null>(null);

  const fetchRequests = useCallback(() => {
    setLoading(true);
    fetch(`/api/purchase-requests?status=${statusFilter}`)
      .then((r) => r.json())
      .then((d) => setRequests(d))
      .catch(() => toast.error("載入失敗"))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  async function loadDetail(id: number) {
    try {
      const res = await fetch(`/api/purchase-requests/${id}`);
      if (!res.ok) {
        toast.error("載入需求明細失敗");
        return null;
      }
      const data: RequestDetail = await res.json();
      setDetailMap((prev) => new Map(prev).set(id, data));
      return data;
    } catch {
      toast.error("載入失敗");
      return null;
    }
  }

  async function toggleExpand(id: number) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!detailMap.has(id)) {
      await loadDetail(id);
    }
  }

  /** 老闆切換食材的廠商 */
  async function setChosenItem(requestId: number, itemId: number, chosenItemId: number) {
    const detail = detailMap.get(requestId);
    if (!detail) return;

    // 樂觀更新 local state
    const newItems = detail.items.map((it) =>
      it.id === itemId ? { ...it, chosen_item_id: chosenItemId } : it
    );
    setDetailMap((prev) => new Map(prev).set(requestId, { ...detail, items: newItems }));

    // 寫入 DB
    const res = await fetch(`/api/purchase-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ id: itemId, chosenItemId }] }),
    });
    if (!res.ok) {
      toast.error("切換廠商失敗");
      await loadDetail(requestId); // rollback
    }
  }

  /** 老闆改數量 */
  async function setNeededQty(requestId: number, itemId: number, qty: number) {
    const detail = detailMap.get(requestId);
    if (!detail) return;
    const newItems = detail.items.map((it) =>
      it.id === itemId ? { ...it, neededQty: qty } : it
    );
    setDetailMap((prev) => new Map(prev).set(requestId, { ...detail, items: newItems }));

    const res = await fetch(`/api/purchase-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ id: itemId, neededQty: qty }] }),
    });
    if (!res.ok) {
      toast.error("改數量失敗");
      await loadDetail(requestId);
    }
  }

  async function handleDispatch(requestId: number) {
    if (!confirm("確定要拆單產生訂單？拆單後不能修改廠商選擇。")) return;
    setDispatching(requestId);
    try {
      const res = await fetch(`/api/purchase-requests/${requestId}/dispatch`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "拆單失敗");
        return;
      }
      const data = await res.json();
      toast.success(`已產出 ${data.supplierCount} 張訂單`);
      fetchRequests();
      setExpandedId(null);
    } finally {
      setDispatching(null);
    }
  }

  async function handleCancel(requestId: number) {
    if (!confirm("確定取消這張需求單？")) return;
    const res = await fetch(`/api/purchase-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    if (res.ok) {
      toast.success("已取消");
      fetchRequests();
    } else {
      toast.error("取消失敗");
    }
  }

  /** 計算單張需求的「廠商分組 + 總金額」 */
  function summarizeBySupplier(items: RequestItem[]) {
    const map = new Map<number, { name: string; total: number; lineCount: number }>();
    for (const it of items) {
      const sku = it.skuOptions.find((s) => s.id === it.chosen_item_id);
      if (!sku) continue;
      const e =
        map.get(sku.supplierId) ?? { name: sku.supplierName, total: 0, lineCount: 0 };
      e.total += sku.costPrice * it.neededQty;
      e.lineCount += 1;
      map.set(sku.supplierId, e);
    }
    return Array.from(map.entries()).map(([id, v]) => ({ supplierId: id, ...v }));
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold">採購規劃</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            員工提的叫貨需求 → 系統推薦廠商 → 你確認後拆單
          </p>
        </div>
      </div>

      {/* 狀態 tab */}
      <div className="flex gap-1.5">
        {(
          [
            { key: "pending", label: "待處理" },
            { key: "processed", label: "已拆單" },
            { key: "cancelled", label: "已取消" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              statusFilter === key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-accent"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 載入中 */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* 列表 */}
      {!loading && requests.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {statusFilter === "pending"
                ? "目前沒有待處理的叫貨需求"
                : `沒有${statusFilter === "processed" ? "已拆單" : "已取消"}的紀錄`}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {requests.map((req) => {
          const isExpanded = expandedId === req.id;
          const detail = detailMap.get(req.id);
          const isPending = req.status === "pending";

          return (
            <div key={req.id} className="border rounded-lg bg-card overflow-hidden">
              {/* 標頭 */}
              <button
                onClick={() => toggleExpand(req.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left"
              >
                {isExpanded ? (
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">#{req.id}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {req.store_name}
                    </Badge>
                    {req.creator_name && (
                      <span className="text-xs text-muted-foreground">{req.creator_name} 提</span>
                    )}
                    {req.status === "processed" && (
                      <Badge className="text-[10px] bg-green-100 text-green-700 border-green-200">
                        已拆 {req.order_ids?.length ?? 0} 張單
                      </Badge>
                    )}
                    {req.status === "cancelled" && (
                      <Badge className="text-[10px] bg-gray-100 text-gray-700">已取消</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {req.request_date} · {req.item_count} 項食材
                    {req.notes ? ` · ${req.notes}` : ""}
                  </div>
                </div>

                {isPending && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCancel(req.id);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </button>

              {/* 展開明細 */}
              {isExpanded && (
                <div className="border-t bg-muted/30 px-4 py-4">
                  {!detail ? (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      載入中...
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* 食材清單 */}
                      <div className="space-y-2">
                        {detail.items.map((it) => {
                          const chosenSku = it.skuOptions.find((s) => s.id === it.chosen_item_id);
                          const cheapest =
                            it.skuOptions.length > 0
                              ? Math.min(...it.skuOptions.map((s) => s.costPrice))
                              : 0;
                          return (
                            <Card key={it.id} className="bg-card">
                              <CardContent className="py-3 px-3 space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {it.ingredient_category && (
                                    <Badge variant="outline" className="text-[10px]">
                                      {it.ingredient_category}
                                    </Badge>
                                  )}
                                  <span className="font-medium">{it.ingredient_name}</span>
                                  {it.currentStock != null && (
                                    <span className="text-xs text-muted-foreground">
                                      現有 {it.currentStock}
                                    </span>
                                  )}
                                  <span className="text-xs text-muted-foreground">
                                    要叫
                                  </span>
                                  {isPending ? (
                                    <Input
                                      type="number"
                                      min={0}
                                      step="0.5"
                                      value={it.neededQty}
                                      onChange={(e) =>
                                        setNeededQty(req.id, it.id, parseFloat(e.target.value) || 0)
                                      }
                                      className="w-20 h-7 text-sm"
                                    />
                                  ) : (
                                    <span className="font-semibold">{it.neededQty}</span>
                                  )}
                                  <span className="text-xs text-muted-foreground">
                                    {it.unit || it.ingredient_unit}
                                  </span>
                                </div>

                                {/* 廠商選擇 */}
                                {it.skuOptions.length === 0 ? (
                                  <div className="text-xs text-amber-600 flex items-center gap-1">
                                    <AlertCircle className="size-3" />
                                    沒有對應的供應商 SKU，請先建品項
                                  </div>
                                ) : isPending ? (
                                  <Select
                                    value={it.chosen_item_id ? String(it.chosen_item_id) : "__none__"}
                                    onValueChange={(v) => {
                                      if (v && v !== "__none__") setChosenItem(req.id, it.id, Number(v));
                                    }}
                                  >
                                    <SelectTrigger className="w-full text-sm">
                                      <SelectValue placeholder="選擇供應商" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {it.skuOptions.map((s) => (
                                        <SelectItem key={s.id} value={String(s.id)}>
                                          <div className="flex items-center gap-1.5">
                                            {s.isPrimary && (
                                              <Star className="size-3 fill-yellow-400 text-yellow-500" />
                                            )}
                                            {s.costPrice === cheapest && !s.isPrimary && (
                                              <Sparkles className="size-3 text-green-600" />
                                            )}
                                            <span className="font-medium">{s.supplierName}</span>
                                            <span className="text-xs text-muted-foreground">
                                              {s.name} ${s.costPrice}/{s.unit}
                                              {s.packSize && ` (${s.packSize})`}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                              庫存 {s.currentStock}
                                            </span>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  chosenSku && (
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <Badge variant="outline">{chosenSku.supplierName}</Badge>
                                      <span>
                                        ${chosenSku.costPrice}/{chosenSku.unit}
                                      </span>
                                      <span>
                                        小計 {formatCurrency(chosenSku.costPrice * it.neededQty)}
                                      </span>
                                    </div>
                                  )
                                )}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>

                      {/* 廠商分組摘要 */}
                      <div>
                        <h4 className="text-sm font-medium mb-2">廠商分組</h4>
                        <div className="space-y-1.5">
                          {summarizeBySupplier(detail.items).map((s) => (
                            <Card key={s.supplierId} className="bg-card">
                              <CardContent className="py-2 px-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">{s.name}</Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {s.lineCount} 項
                                  </span>
                                </div>
                                <span className="font-semibold">{formatCurrency(s.total)}</span>
                              </CardContent>
                            </Card>
                          ))}
                          <div className="flex items-center justify-between px-3 py-1.5 text-sm font-semibold border-t mt-2">
                            <span>總計</span>
                            <span className="text-primary">
                              {formatCurrency(
                                summarizeBySupplier(detail.items).reduce((sum, s) => sum + s.total, 0)
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 操作按鈕 */}
                      {isPending && (
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            onClick={() => handleCancel(req.id)}
                            disabled={dispatching === req.id}
                          >
                            取消需求
                          </Button>
                          <Button
                            onClick={() => handleDispatch(req.id)}
                            disabled={dispatching === req.id}
                            className="gap-1.5"
                          >
                            {dispatching === req.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Send className="size-4" />
                            )}
                            拆單產生訂單
                          </Button>
                        </div>
                      )}

                      {/* 已拆單看訂單連結 */}
                      {req.status === "processed" && req.order_ids?.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          已拆出訂單 #
                          {req.order_ids.join(", #")} — 進
                          <a href="/dashboard/orders" className="text-primary hover:underline ml-1">
                            訂單管理
                          </a>
                          查看
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

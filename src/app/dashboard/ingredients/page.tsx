"use client";

/**
 * 食材中心 / Ingredient Hub
 *
 * 三層架構的橫向視角 — 每一列是「食材」，展開看對應的多家供應商比價
 *
 * 功能：
 *   - 列表：食材名 / 分類 / 供應商家數 / 主家+主家價 / 用在幾道菜
 *   - 搜尋 + 分類篩選
 *   - 點開：展開該食材的所有 SKU 比價（含庫存、最便宜 ✨、主家 ⭐）
 *   - 用在哪些菜（雙向關聯）
 *   - 切換主供應商（admin only）
 */

import { useEffect, useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Star,
  Sparkles,
  AlertCircle,
  SearchX,
  Carrot,
  Boxes,
  Flame,
  Truck,
  UtensilsCrossed,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SkeletonTable } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";

interface IngredientRow {
  id: number;
  name: string;
  category: string | null;
  unit: string;
  supplierCount: number;
  primaryItemId: number | null;
  primaryItemName: string | null;
  primarySupplierName: string | null;
  primaryCost: number | null;
  menuUseCount: number;
}

interface SkuDetail {
  id: number;
  name: string;
  sku: string | null;
  is_active: boolean;
  is_primary: boolean;
  cost_price: number;
  store_price: number;
  unit: string;
  pack_size: string | null;
  total_stock: number;
  supplier_id: number;
  supplier_name: string;
  isCheapest: boolean;
}

interface MenuUseRow {
  id: number;
  name: string;
  category: string;
  sell_price: number | string;
  quantity: string;
}

interface IngredientDetail {
  ingredient: { id: number; name: string; category: string | null; unit: string; notes: string | null };
  skus: SkuDetail[];
  menuItems: MenuUseRow[];
  summary: {
    skuCount: number;
    menuCount: number;
    minCost: number | null;
    avgCost: number | null;
    totalStock: number;
    last7DaysOutflow: number;
  };
}

export default function IngredientsHubPage() {
  const [items, setItems] = useState<IngredientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("全部");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailMap, setDetailMap] = useState<Map<number, IngredientDetail>>(new Map());

  const fetchList = useCallback(() => {
    setLoading(true);
    fetch("/api/ingredients")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`); // 401 不要往下 .map 非陣列
        return r.json();
      })
      .then((d) => {
        setItems(Array.isArray(d) ? d : []);
      })
      .catch(() => toast.error("載入失敗"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const categories = useMemo(
    () => [
      "全部",
      ...Array.from(new Set(items.map((i) => i.category).filter((c): c is string => !!c))),
    ],
    [items]
  );

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (filterCat !== "全部" && i.category !== filterCat) return false;
      if (search) {
        return i.name.toLowerCase().includes(search.toLowerCase());
      }
      return true;
    });
  }, [items, filterCat, search]);

  async function toggleExpand(id: number) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!detailMap.has(id)) {
      try {
        const res = await fetch(`/api/ingredients/${id}`);
        if (!res.ok) {
          toast.error("載入詳情失敗");
          return;
        }
        const data: IngredientDetail = await res.json();
        setDetailMap((prev) => new Map(prev).set(id, data));
      } catch {
        toast.error("載入詳情失敗");
      }
    }
  }

  async function handleSetPrimary(ingredientId: number, itemId: number, itemName: string) {
    if (!confirm(`確定將「${itemName}」設為主供應商？\n之後 BOM 成本計算會用這家的進貨價。`)) {
      return;
    }
    const res = await fetch(`/api/ingredients/${ingredientId}/set-primary`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
    if (res.ok) {
      toast.success(`已設「${itemName}」為主供應商`);
      // 重載 list 和該食材詳情
      fetchList();
      detailMap.delete(ingredientId);
      setDetailMap(new Map(detailMap));
      if (expandedId === ingredientId) {
        const refreshed = await fetch(`/api/ingredients/${ingredientId}`).then((r) => r.json());
        setDetailMap((prev) => new Map(prev).set(ingredientId, refreshed));
      }
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || "切換失敗");
    }
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <SkeletonTable rows={8} cols={4} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">食材中心</h2>
          <p className="text-sm text-muted-foreground mt-0.5 tabular-nums">
            共 {items.length} 個食材 · 多供應商比價 · 主供應商管理
          </p>
        </div>
      </div>

      {/* 搜尋 + 分類 */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="搜尋食材..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCat(cat)}
              className={`h-8 px-3 text-xs rounded-full border transition-colors ${
                filterCat === cat
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-accent"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 食材列表 */}
      <div className="space-y-2">
        {filtered.length === 0 &&
          (search !== "" || filterCat !== "全部" ? (
            <EmptyState
              icon={SearchX}
              title="沒有符合的食材"
              description="換個關鍵字，或把分類切回「全部」再找找看。"
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    setFilterCat("全部");
                  }}
                >
                  清除篩選條件
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Carrot}
              title="還沒有任何食材"
              description="食材是把各供應商的同一樣東西串起來的那一層。到「品項管理」把採購品項對應到食材後，這裡就會出現比價資料。"
            />
          ))}
        {filtered.map((ing) => {
          const isExpanded = expandedId === ing.id;
          const detail = detailMap.get(ing.id);

          return (
            <div
              key={ing.id}
              className="rounded-xl bg-card ring-1 ring-foreground/10 overflow-hidden transition-shadow hover:shadow-sm"
            >
              {/* 標頭 */}
              <button
                onClick={() => toggleExpand(ing.id)}
                className="w-full flex items-center gap-3 px-3 sm:px-4 py-3 hover:bg-muted/30 transition-colors text-left"
              >
                {isExpanded ? (
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{ing.name}</span>
                    {ing.category && (
                      <Badge variant="secondary" className="text-[10px]">
                        {ing.category}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">/{ing.unit}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                    <span className="tabular-nums">{ing.supplierCount} 家供應商</span>
                    {ing.menuUseCount > 0 && (
                      <span className="tabular-nums">用在 {ing.menuUseCount} 道菜</span>
                    )}
                    {ing.supplierCount === 0 && (
                      <span className="text-amber-600 flex items-center gap-1">
                        <AlertCircle className="size-3" /> 無對應 SKU
                      </span>
                    )}
                  </div>
                </div>

                {/* 主供應商 + 主家價 */}
                {ing.primarySupplierName && ing.primaryCost != null ? (
                  <div className="text-right shrink-0">
                    <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                      <Star className="size-3 fill-yellow-400 text-yellow-500" />
                      {ing.primarySupplierName}
                    </div>
                    <div className="text-sm font-semibold tabular-nums">
                      {formatCurrency(ing.primaryCost)}
                      <span className="text-muted-foreground font-normal">/{ing.unit}</span>
                    </div>
                  </div>
                ) : ing.supplierCount > 0 ? (
                  <span className="text-xs text-amber-600 shrink-0">尚未設主供應商</span>
                ) : null}
              </button>

              {/* 展開明細 */}
              {isExpanded && (
                <div className="border-t bg-muted/30 px-3 sm:px-4 py-3">
                  {!detail ? (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      載入中...
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* 庫存 + 消耗 summary */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <StatCard
                          label="總庫存"
                          icon={Boxes}
                          accent="bg-orange-100 text-orange-600"
                          value={
                            <>
                              {detail.summary.totalStock}
                              <span className="ml-1 text-sm font-normal text-muted-foreground">
                                {detail.ingredient.unit}
                              </span>
                            </>
                          }
                        />
                        <StatCard
                          label="7 日消耗"
                          icon={Flame}
                          accent="bg-purple-100 text-purple-600"
                          value={detail.summary.last7DaysOutflow}
                          hint={detail.ingredient.unit}
                        />
                        <StatCard
                          label="供應商"
                          icon={Truck}
                          accent="bg-blue-100 text-blue-600"
                          value={
                            <>
                              {detail.summary.skuCount}
                              <span className="ml-1 text-sm font-normal text-muted-foreground">家</span>
                            </>
                          }
                        />
                        <StatCard
                          label="用在"
                          icon={UtensilsCrossed}
                          accent="bg-emerald-100 text-emerald-600"
                          value={
                            <>
                              {detail.summary.menuCount}
                              <span className="ml-1 text-sm font-normal text-muted-foreground">道菜</span>
                            </>
                          }
                        />
                      </div>

                      {/* SKU 比價表 */}
                      <div>
                        <h4 className="text-sm font-medium mb-2">供應商比價</h4>
                        {detail.skus.length === 0 ? (
                          <EmptyState
                            className="py-6 rounded-xl bg-card ring-1 ring-foreground/10"
                            icon={Truck}
                            title="尚無對應 SKU"
                            description="這個食材還沒對應到任何供應商品項，到「品項管理」把採購品項指到它就能開始比價。"
                          />
                        ) : (
                          <div className="space-y-1.5">
                            {detail.skus.map((sku) => (
                              <Card
                                key={sku.id}
                                className={`${!sku.is_active ? "opacity-50" : ""} ${sku.is_primary ? "border-yellow-400/60 bg-yellow-50/30" : ""}`}
                              >
                                <CardContent className="py-2.5 px-3 flex items-center gap-2 flex-wrap">
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    {sku.is_primary && (
                                      <Star className="size-3.5 fill-yellow-400 text-yellow-500 shrink-0" />
                                    )}
                                    {sku.isCheapest && !sku.is_primary && (
                                      <Sparkles className="size-3.5 text-green-600 shrink-0" />
                                    )}
                                    <Badge variant="outline" className="text-[10px] shrink-0">
                                      {sku.supplier_name}
                                    </Badge>
                                    <span className="text-sm font-medium truncate">{sku.name}</span>
                                    {sku.pack_size && (
                                      <span className="text-[10px] text-muted-foreground">
                                        ({sku.pack_size})
                                      </span>
                                    )}
                                    {!sku.is_active && (
                                      <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700">
                                        已停用
                                      </Badge>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-3 text-xs shrink-0">
                                    <div className="tabular-nums">
                                      <span className="text-muted-foreground">進貨</span>{" "}
                                      <span className="font-semibold">
                                        {formatCurrency(sku.cost_price)}
                                      </span>
                                      <span className="text-muted-foreground">/{sku.unit}</span>
                                    </div>
                                    <div className="tabular-nums">
                                      <span className="text-muted-foreground">庫存</span>{" "}
                                      <span
                                        className={
                                          sku.total_stock <= 0 ? "font-semibold text-red-600" : "font-medium"
                                        }
                                      >
                                        {sku.total_stock}
                                      </span>
                                    </div>
                                    {!sku.is_primary && sku.is_active && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-xs"
                                        onClick={() => handleSetPrimary(ing.id, sku.id, sku.name)}
                                      >
                                        設為主家
                                      </Button>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 用在哪些菜 */}
                      {detail.menuItems.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium mb-2 tabular-nums">
                            用在 {detail.menuItems.length} 道菜
                          </h4>
                          <div className="flex flex-wrap gap-1.5">
                            {detail.menuItems.map((m) => (
                              <div
                                key={m.id}
                                className="px-2 py-1 bg-card rounded-lg ring-1 ring-foreground/10 text-xs"
                                title={`售價 ${formatCurrency(Number(m.sell_price))} · 用量 ${m.quantity}`}
                              >
                                <span className="text-muted-foreground">{m.category}</span>
                                <span className="mx-1">·</span>
                                <span className="font-medium">{m.name}</span>
                                <span className="text-muted-foreground ml-1 tabular-nums">
                                  ({m.quantity})
                                </span>
                              </div>
                            ))}
                          </div>
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

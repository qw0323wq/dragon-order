"use client";

/**
 * BOM 菜單列表 — 含展開配方明細表 + 編輯/刪除 icon
 *
 * 顯示「總公司毛利」+「分店毛利」並列：
 *   admin/buyer  → 兩組都顯示
 *   manager      → 只顯示「分店毛利」（保護總公司進貨價）
 *   staff        → 都不顯示成本
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/format";
import { ChevronDown, ChevronRight, Pencil, Trash2, AlertTriangle, EyeOff, Eye, Ruler, SearchX } from "lucide-react";
import type { MenuItemBom } from "./types";
import { CATEGORY_COLORS, MARGIN_THRESHOLDS } from "./types";

// 配色門檻與篩選器共用同一組常數（MARGIN_THRESHOLDS），確保顯示與篩選一致
function marginColorClass(rate: number): string {
  if (rate >= MARGIN_THRESHOLDS.STORE_HIGH) return "text-green-600";
  if (rate >= MARGIN_THRESHOLDS.STORE_LOW) return "text-yellow-600";
  return "text-red-600";
}

interface MenuListProps {
  items: MenuItemBom[];
  expandedIds: Set<number>;
  onToggleExpand: (id: number) => void;
  onEdit: (item: MenuItemBom) => void;
  onDelete: (item: MenuItemBom) => void;
  onToggleActive: (item: MenuItemBom) => void;
}

export function MenuList({ items, expandedIds, onToggleExpand, onEdit, onDelete, onToggleActive }: MenuListProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="找不到符合的菜品"
        description="試著換個關鍵字，或把分類、毛利、上下架篩選切回「全部」再找一次。"
      />
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isExpanded = expandedIds.has(item.id);
        const catColor = CATEGORY_COLORS[item.category] || "bg-gray-100 text-gray-700";

        const isInactive = !item.isActive;
        return (
          <div
            key={item.id}
            className={`border rounded-lg bg-card overflow-hidden ${
              isInactive ? "opacity-60 border-dashed" : ""
            }`}
          >
            {/* 菜品標頭（手機縮小左右內距，避免品名/毛利/按鈕擠爆版） */}
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 hover:bg-accent/50 transition-colors">
              <button
                onClick={() => onToggleExpand(item.id)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                {isExpanded ? (
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium truncate ${isInactive ? "line-through" : ""}`}>
                      {item.name}
                    </span>
                    <Badge variant="secondary" className={`text-[10px] ${catColor}`}>
                      {item.category}
                    </Badge>
                    {isInactive && (
                      <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700 bg-orange-50">
                        已下架
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {item.ingredients.length} 項食材
                    {item.notes ? ` · ${item.notes}` : ""}
                  </div>
                </div>

                {/* 售價 / 總公司毛利 / 分店毛利 — 三個獨立欄位（方便排序篩選） */}
                <div className="hidden sm:flex items-center gap-1 shrink-0 text-right">
                  {/* 售價欄 */}
                  <div className="w-16 px-2">
                    <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">售價</div>
                    <div className="text-sm font-semibold mt-0.5 tabular-nums">{formatCurrency(item.sellPrice)}</div>
                  </div>

                  {/* 總公司毛利欄 */}
                  <div className="w-24 px-2 border-l border-border/50">
                    <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">總公司毛利</div>
                    {item.hqRevenue > 0 ? (
                      <>
                        <div className={`text-sm font-bold mt-0.5 tabular-nums ${marginColorClass(item.hqMargin)}`}>
                          {(item.hqMargin * 100).toFixed(1)}%
                        </div>
                        <div className="text-[10px] text-muted-foreground/80 leading-tight tabular-nums">
                          {formatCurrency(Math.round(item.hqRevenue))} / {formatCurrency(Math.round(item.hqCost))}
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-muted-foreground/50 mt-0.5">—</div>
                    )}
                  </div>

                  {/* 分店毛利欄 */}
                  <div className="w-24 px-2 border-l border-border/50">
                    <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">分店毛利</div>
                    {item.storeCost > 0 ? (
                      <>
                        <div className={`text-sm font-bold mt-0.5 tabular-nums ${marginColorClass(item.storeMargin)}`}>
                          {(item.storeMargin * 100).toFixed(1)}%
                        </div>
                        <div className="text-[10px] text-muted-foreground/80 leading-tight tabular-nums">
                          {formatCurrency(item.sellPrice)} / {formatCurrency(Math.round(item.storeCost))}
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-muted-foreground/50 mt-0.5">—</div>
                    )}
                  </div>
                </div>

                {/* 手機版（≤ sm）— 維持原本緊湊顯示 */}
                <div className="sm:hidden text-right shrink-0">
                  <div className="text-sm font-semibold tabular-nums">售 {formatCurrency(item.sellPrice)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5 leading-snug">
                    {item.hqRevenue > 0 && (
                      <div>
                        總:&nbsp;
                        <span className={`font-semibold tabular-nums ${marginColorClass(item.hqMargin)}`}>
                          {(item.hqMargin * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                    {item.storeCost > 0 && (
                      <div>
                        店:&nbsp;
                        <span className={`font-semibold tabular-nums ${marginColorClass(item.storeMargin)}`}>
                          {(item.storeMargin * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 警示符號（共用） */}
                {item.hasUnknownIngredient && (
                  <div
                    className="shrink-0 flex items-center text-amber-600"
                    title="有食材未對應品項，成本可能不準"
                  >
                    <AlertTriangle className="size-3.5" />
                  </div>
                )}
                {item.hasUnitMismatch && (
                  <div
                    className="shrink-0 flex items-center text-orange-600"
                    title="有食材的用量單位與供應商計價單位跨維度（如 顆↔包），尚未設定換算，該食材成本未計入"
                  >
                    <Ruler className="size-3.5" />
                  </div>
                )}
              </button>

              {/* 操作按鈕 */}
              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => onEdit(item)}
                  title="編輯"
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`size-8 ${isInactive ? "text-green-600 hover:text-green-700" : "text-orange-600 hover:text-orange-700"}`}
                  onClick={() => onToggleActive(item)}
                  title={isInactive ? "重新上架" : "下架"}
                >
                  {isInactive ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive hover:text-destructive"
                  onClick={() => onDelete(item)}
                  title="刪除"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>

            {/* 展開的 BOM 明細 */}
            {isExpanded && item.ingredients.length > 0 && (
              <div className="border-t bg-muted/30 px-3 sm:px-4 py-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-left py-1 font-normal w-8">#</th>
                      <th className="text-left py-1 font-normal">食材</th>
                      <th className="text-left py-1 font-normal">用量</th>
                      {item.hqCost > 0 && (
                        <th className="text-right py-1 font-normal whitespace-nowrap">進貨價</th>
                      )}
                      {item.storeCost > 0 && (
                        <th className="text-right py-1 font-normal whitespace-nowrap">分店採購價</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {item.ingredients.map((ing, idx) => (
                      <tr key={ing.id} className="border-t border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-1.5 text-muted-foreground tabular-nums">{idx + 1}</td>
                        <td className="py-1.5">
                          {ing.ingredientName}
                          {ing.supplierCount > 1 && (
                            <span className="text-[10px] text-blue-600 ml-1" title={`${ing.supplierCount} 家供應商可選`}>
                              ({ing.supplierCount}家)
                            </span>
                          )}
                          {ing.priceSource === "fallback" && (
                            <span className="text-[10px] text-amber-600 ml-1" title="主供應商未設定，用備援來源算成本">
                              ⚠ 備援
                            </span>
                          )}
                          {ing.priceSource === "none" && (
                            <span className="text-[10px] text-red-600 ml-1" title="無對應 SKU，成本無法計算">
                              ⚠ 未對應
                            </span>
                          )}
                          {ing.unitMismatch && (
                            <span className="text-[10px] text-orange-600 ml-1" title="用量單位與供應商計價單位跨維度，尚未設定換算，此食材成本未計入">
                              ⚠ 單位待設定
                            </span>
                          )}
                          {ing.itemUnit && (
                            <span className="text-xs text-muted-foreground ml-1">
                              ({ing.itemUnit})
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 text-muted-foreground tabular-nums whitespace-nowrap">{ing.quantity}</td>
                        {item.hqCost > 0 && (
                          <td className="py-1.5 text-right text-muted-foreground tabular-nums whitespace-nowrap">
                            {ing.hqCost > 0 ? formatCurrency(ing.hqCost) : "-"}
                          </td>
                        )}
                        {item.storeCost > 0 && (
                          <td className="py-1.5 text-right text-muted-foreground tabular-nums whitespace-nowrap">
                            {ing.storeCost > 0 ? formatCurrency(ing.storeCost) : "-"}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

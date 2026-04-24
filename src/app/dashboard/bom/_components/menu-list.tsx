"use client";

/**
 * BOM 菜單列表 — 含展開配方明細表 + 編輯/刪除 icon
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";
import type { MenuItemBom } from "./types";
import { CATEGORY_COLORS } from "./types";

interface MenuListProps {
  items: MenuItemBom[];
  expandedIds: Set<number>;
  onToggleExpand: (id: number) => void;
  onEdit: (item: MenuItemBom) => void;
  onDelete: (item: MenuItemBom) => void;
}

export function MenuList({ items, expandedIds, onToggleExpand, onEdit, onDelete }: MenuListProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        找不到符合的菜品
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isExpanded = expandedIds.has(item.id);
        const catColor = CATEGORY_COLORS[item.category] || "bg-gray-100 text-gray-700";

        return (
          <div key={item.id} className="border rounded-lg bg-card overflow-hidden">
            {/* 菜品標頭 */}
            <div className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors">
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
                    <span className="font-medium truncate">{item.name}</span>
                    <Badge variant="secondary" className={`text-[10px] ${catColor}`}>
                      {item.category}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {item.ingredients.length} 項食材
                    {item.notes ? ` · ${item.notes}` : ""}
                  </div>
                </div>

                {/* 價格區 */}
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold">售 ${item.sellPrice}</div>
                  {item.costPerServing > 0 && (
                    <div className="text-xs text-muted-foreground">
                      成本 ${item.costPerServing.toFixed(1)} · 毛利{" "}
                      <span
                        className={
                          item.marginRate >= 0.6
                            ? "text-green-600"
                            : item.marginRate >= 0.45
                            ? "text-yellow-600"
                            : "text-red-600"
                        }
                      >
                        {(item.marginRate * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
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
              <div className="border-t bg-muted/30 px-4 py-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-left py-1 font-normal">#</th>
                      <th className="text-left py-1 font-normal">食材</th>
                      <th className="text-left py-1 font-normal">用量</th>
                      {item.costPerServing > 0 && (
                        <th className="text-right py-1 font-normal">單位成本</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {item.ingredients.map((ing, idx) => (
                      <tr key={ing.id} className="border-t border-border/50">
                        <td className="py-1.5 text-muted-foreground">{idx + 1}</td>
                        <td className="py-1.5">
                          {ing.ingredientName}
                          {ing.itemUnit && (
                            <span className="text-xs text-muted-foreground ml-1">
                              ({ing.itemUnit})
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 text-muted-foreground">{ing.quantity}</td>
                        {item.costPerServing > 0 && (
                          <td className="py-1.5 text-right text-muted-foreground">
                            {ing.itemCost > 0 ? `$${ing.itemCost}` : "-"}
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

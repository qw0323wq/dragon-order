"use client";

/**
 * BOM 配方管理頁
 * 顯示菜單商品及其配方（BOM），含成本、毛利率
 */

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronDown, ChevronRight } from "lucide-react";

interface Ingredient {
  id: number;
  ingredientName: string;
  quantity: string;
  itemId: number | null;
  itemName: string | null;
  itemUnit: string | null;
  itemCost: number;
}

interface MenuItemBom {
  id: number;
  name: string;
  category: string;
  sellPrice: number;
  costPerServing: number;
  marginRate: number;
  notes: string | null;
  isActive: boolean;
  ingredients: Ingredient[];
}

const CATEGORY_COLORS: Record<string, string> = {
  鍋底: "bg-red-100 text-red-700",
  肉品: "bg-amber-100 text-amber-700",
  海鮮: "bg-blue-100 text-blue-700",
  火鍋料: "bg-orange-100 text-orange-700",
  特色: "bg-pink-100 text-pink-700",
  蔬菜: "bg-green-100 text-green-700",
  飲料: "bg-purple-100 text-purple-700",
};

export default function BomPage() {
  const [data, setData] = useState<MenuItemBom[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("全部");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch("/api/bom")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const categories = ["全部", ...Array.from(new Set(data.map((d) => d.category)))];

  const filtered = data.filter((item) => {
    if (filterCat !== "全部" && item.category !== filterCat) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        item.name.toLowerCase().includes(s) ||
        item.ingredients.some((ing) =>
          ing.ingredientName.toLowerCase().includes(s)
        )
      );
    }
    return true;
  });

  function toggleExpand(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpandedIds(new Set(filtered.map((d) => d.id)));
  }

  function collapseAll() {
    setExpandedIds(new Set());
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 標題 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">BOM 配方管理</h1>
          <p className="text-sm text-muted-foreground">
            {data.length} 道菜品，{data.reduce((sum, d) => sum + d.ingredients.length, 0)} 筆配方明細
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={expandAll}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 border rounded"
          >
            全部展開
          </button>
          <button
            onClick={collapseAll}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 border rounded"
          >
            全部收合
          </button>
        </div>
      </div>

      {/* 搜尋 + 分類篩選 */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="搜尋菜品或食材..."
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
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
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

      {/* 菜品列表 */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            找不到符合的菜品
          </div>
        ) : (
          filtered.map((item) => {
            const isExpanded = expandedIds.has(item.id);
            const catColor = CATEGORY_COLORS[item.category] || "bg-gray-100 text-gray-700";

            return (
              <div
                key={item.id}
                className="border rounded-lg bg-card overflow-hidden"
              >
                {/* 菜品標頭 */}
                <button
                  onClick={() => toggleExpand(item.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left"
                >
                  {isExpanded ? (
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{item.name}</span>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] ${catColor}`}
                      >
                        {item.category}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {item.ingredients.length} 項食材
                      {item.notes ? ` · ${item.notes}` : ""}
                    </div>
                  </div>

                  {/* 價格區（只有老闆/店長看得到） */}
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold">
                      售 ${item.sellPrice}
                    </div>
                    {item.costPerServing > 0 && (
                      <div className="text-xs text-muted-foreground">
                        成本 ${item.costPerServing.toFixed(1)} · 毛利{" "}
                        <span
                          className={
                            item.marginRate >= 0.7
                              ? "text-green-600"
                              : item.marginRate >= 0.5
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
                            <th className="text-right py-1 font-normal">
                              單位成本
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {item.ingredients.map((ing, idx) => (
                          <tr key={ing.id} className="border-t border-border/50">
                            <td className="py-1.5 text-muted-foreground">
                              {idx + 1}
                            </td>
                            <td className="py-1.5">
                              {ing.ingredientName}
                              {ing.itemUnit && (
                                <span className="text-xs text-muted-foreground ml-1">
                                  ({ing.itemUnit})
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 text-muted-foreground">
                              {ing.quantity}
                            </td>
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
          })
        )}
      </div>
    </div>
  );
}

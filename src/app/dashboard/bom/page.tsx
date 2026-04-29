"use client";

/**
 * BOM 配方管理頁（主 orchestrator）
 *
 * 功能：
 *  1. 菜單商品列表（搜尋 + 分類篩選 + 展開配方明細）
 *  2. 毛利率顏色標示
 *  3. 新增/編輯/刪除菜品 + 配方明細
 *
 * 拆分（P2-C9，2026-04-24）：
 *   _components/types.ts   — 型別 + 常數
 *   _components/bom-dialog.tsx — 新增/編輯 Dialog
 *   _components/menu-list.tsx  — 菜單列表（含展開明細）
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Search, Plus } from "lucide-react";

import type { MenuItemBom } from "./_components/types";
import { BomDialog } from "./_components/bom-dialog";
import { MenuList } from "./_components/menu-list";

/** 排序模式 */
type SortMode =
  | "default"        // 預設（分類 → 名稱）
  | "hqAsc"          // 總公司毛利 低 → 高
  | "hqDesc"         // 總公司毛利 高 → 低
  | "storeAsc"       // 分店毛利 低 → 高
  | "storeDesc";     // 分店毛利 高 → 低

/** 毛利篩選 — 鎖定哪一層、低於 / 高於 哪個門檻 */
type MarginFilter =
  | { kind: "all" }
  | { kind: "low"; layer: "hq" | "store"; threshold: number }
  | { kind: "high"; layer: "hq" | "store"; threshold: number };

export default function BomPage() {
  const [data, setData] = useState<MenuItemBom[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("全部");
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [marginFilter, setMarginFilter] = useState<MarginFilter>({ kind: "all" });
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MenuItemBom | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MenuItemBom | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    setFetchError(false);
    fetch("/api/bom")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        setFetchError(true);
      });
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const categories = useMemo(
    () => ["全部", ...Array.from(new Set(data.map((d) => d.category)))],
    [data]
  );

  const filtered = useMemo(() => {
    // 先過濾
    const out = data.filter((item) => {
      if (filterCat !== "全部" && item.category !== filterCat) return false;
      if (search) {
        const s = search.toLowerCase();
        const matchesText =
          item.name.toLowerCase().includes(s) ||
          item.ingredients.some((ing) =>
            ing.ingredientName.toLowerCase().includes(s)
          );
        if (!matchesText) return false;
      }
      // 毛利篩選 — 只對「該 layer 有資料」的菜品有意義（沒對應食材的跳過）
      if (marginFilter.kind !== "all") {
        const margin =
          marginFilter.layer === "hq" ? item.hqMargin : item.storeMargin;
        const hasLayerData =
          marginFilter.layer === "hq" ? item.hqRevenue > 0 : item.storeCost > 0;
        if (!hasLayerData) return false;
        if (marginFilter.kind === "low" && margin >= marginFilter.threshold)
          return false;
        if (marginFilter.kind === "high" && margin < marginFilter.threshold)
          return false;
      }
      return true;
    });

    // 再排序
    if (sortMode === "default") return out;
    return [...out].sort((a, b) => {
      switch (sortMode) {
        case "hqAsc":
          return a.hqMargin - b.hqMargin;
        case "hqDesc":
          return b.hqMargin - a.hqMargin;
        case "storeAsc":
          return a.storeMargin - b.storeMargin;
        case "storeDesc":
          return b.storeMargin - a.storeMargin;
        default:
          return 0;
      }
    });
  }, [data, filterCat, search, sortMode, marginFilter]);

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

  function handleAdd() {
    setEditTarget(null);
    setDialogOpen(true);
  }

  function handleEdit(item: MenuItemBom) {
    setEditTarget(item);
    setDialogOpen(true);
  }

  function handleDelete(item: MenuItemBom) {
    setDeleteTarget(item);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/bom/${deleteTarget.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(`已刪除「${deleteTarget.name}」`);
      setDeleteTarget(null);
      fetchData();
    } else {
      const err = await res.json();
      toast.error(err.error || "刪除失敗");
    }
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-sm text-muted-foreground">載入失敗，請檢查網路連線</p>
        <Button variant="outline" size="sm" onClick={fetchData}>
          重試
        </Button>
      </div>
    );
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
      {/* 標題 + 操作按鈕 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">BOM 配方管理</h1>
          <p className="text-sm text-muted-foreground">
            {data.length} 道菜品，
            {data.reduce((sum, d) => sum + d.ingredients.length, 0)} 筆配方明細
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
          <Button className="gap-1.5" size="sm" onClick={handleAdd}>
            <Plus className="size-4" />
            新增菜品
          </Button>
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

        {/* 排序 + 毛利篩選 */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          {/* 排序 */}
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">排序：</span>
            {(
              [
                { key: "default", label: "預設" },
                { key: "hqDesc", label: "總公司↓" },
                { key: "hqAsc", label: "總公司↑" },
                { key: "storeDesc", label: "分店↓" },
                { key: "storeAsc", label: "分店↑" },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSortMode(key)}
                className={`px-2 py-0.5 rounded border transition-colors ${
                  sortMode === key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-accent"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 毛利篩選 */}
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">毛利：</span>
            <button
              onClick={() => setMarginFilter({ kind: "all" })}
              className={`px-2 py-0.5 rounded border transition-colors ${
                marginFilter.kind === "all"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-accent"
              }`}
            >
              全部
            </button>
            <button
              onClick={() =>
                setMarginFilter({ kind: "low", layer: "hq", threshold: 0.2 })
              }
              className={`px-2 py-0.5 rounded border transition-colors ${
                marginFilter.kind === "low" && marginFilter.layer === "hq"
                  ? "bg-red-500 text-white border-red-500"
                  : "bg-background text-muted-foreground border-border hover:bg-accent"
              }`}
              title="總公司毛利低於 20% 的菜品"
            >
              總公司&lt;20%
            </button>
            <button
              onClick={() =>
                setMarginFilter({ kind: "low", layer: "store", threshold: 0.5 })
              }
              className={`px-2 py-0.5 rounded border transition-colors ${
                marginFilter.kind === "low" && marginFilter.layer === "store"
                  ? "bg-red-500 text-white border-red-500"
                  : "bg-background text-muted-foreground border-border hover:bg-accent"
              }`}
              title="分店毛利低於 50% 的菜品（容易賠錢）"
            >
              分店&lt;50%
            </button>
            <button
              onClick={() =>
                setMarginFilter({ kind: "high", layer: "store", threshold: 0.7 })
              }
              className={`px-2 py-0.5 rounded border transition-colors ${
                marginFilter.kind === "high" && marginFilter.layer === "store"
                  ? "bg-green-600 text-white border-green-600"
                  : "bg-background text-muted-foreground border-border hover:bg-accent"
              }`}
              title="分店毛利高於 70% 的菜品（賺錢主力）"
            >
              分店&gt;70%
            </button>
          </div>
        </div>
      </div>

      {/* 菜品列表 */}
      <MenuList
        items={filtered}
        expandedIds={expandedIds}
        onToggleExpand={toggleExpand}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* 新增/編輯 Dialog */}
      <BomDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editTarget={editTarget}
        onSaved={fetchData}
      />

      {/* 刪除確認 Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>確定要刪除？</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            將會刪除「<strong>{deleteTarget?.name}</strong>」及其所有配方明細，
            此操作無法復原。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              確定刪除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

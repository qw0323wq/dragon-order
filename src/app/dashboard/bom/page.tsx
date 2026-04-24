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

export default function BomPage() {
  const [data, setData] = useState<MenuItemBom[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("全部");
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
    return data.filter((item) => {
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
  }, [data, filterCat, search]);

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

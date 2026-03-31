"use client";

/**
 * BOM 配方管理頁
 * 功能：
 *  1. 菜單商品列表（搜尋 + 分類篩選 + 展開配方明細）
 *  2. 毛利率顏色標示
 *  3. 新增/編輯/刪除菜品 + 配方明細
 */

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";

// ── 型別 ──

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

interface IngredientForm {
  ingredientName: string;
  quantity: string;
  itemId: number | null;
}

interface BomFormData {
  name: string;
  category: string;
  sellPrice: number;
  notes: string;
  ingredients: IngredientForm[];
}

// ── 常數 ──

const BOM_CATEGORIES = [
  "鍋底",
  "肉品",
  "海鮮",
  "火鍋料",
  "特色",
  "蔬菜",
  "飲料",
  "酒類",
];

const CATEGORY_COLORS: Record<string, string> = {
  鍋底: "bg-red-100 text-red-700",
  肉品: "bg-amber-100 text-amber-700",
  海鮮: "bg-blue-100 text-blue-700",
  火鍋料: "bg-orange-100 text-orange-700",
  特色: "bg-pink-100 text-pink-700",
  蔬菜: "bg-green-100 text-green-700",
  飲料: "bg-purple-100 text-purple-700",
  酒類: "bg-violet-100 text-violet-700",
};

const EMPTY_FORM: BomFormData = {
  name: "",
  category: "",
  sellPrice: 0,
  notes: "",
  ingredients: [{ ingredientName: "", quantity: "", itemId: null }],
};

// ── 編輯 Dialog ──

interface ItemOption {
  id: number;
  name: string;
  unit: string;
  costPrice: number;
  category: string;
}

function BomDialog({
  open,
  onOpenChange,
  editTarget,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editTarget: MenuItemBom | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<BomFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [allItems, setAllItems] = useState<ItemOption[]>([]);
  const [itemSearch, setItemSearch] = useState<Record<number, string>>({});
  const [dropdownOpen, setDropdownOpen] = useState<Record<number, boolean>>({});
  const [ingredientCatFilter, setIngredientCatFilter] = useState<Record<number, string>>({});

  // 載入品項清單
  useEffect(() => {
    fetch("/api/items")
      .then((r) => r.json())
      .then((data: ItemOption[]) => setAllItems(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      setItemSearch({});
      setDropdownOpen({});
      setIngredientCatFilter({});
      if (editTarget) {
        setForm({
          name: editTarget.name,
          category: editTarget.category,
          sellPrice: editTarget.sellPrice,
          notes: editTarget.notes || "",
          ingredients:
            editTarget.ingredients.length > 0
              ? editTarget.ingredients.map((ig) => ({
                  ingredientName: ig.ingredientName,
                  quantity: ig.quantity,
                  itemId: ig.itemId,
                }))
              : [{ ingredientName: "", quantity: "", itemId: null }],
        });
      } else {
        setForm(EMPTY_FORM);
      }
    }
  }, [open, editTarget]);

  function updateIngredient(
    idx: number,
    field: keyof IngredientForm,
    value: string | number | null
  ) {
    setForm((prev) => ({
      ...prev,
      ingredients: prev.ingredients.map((ig, i) =>
        i === idx ? { ...ig, [field]: value } : ig
      ),
    }));
  }

  function addIngredient() {
    setForm((prev) => ({
      ...prev,
      ingredients: [
        ...prev.ingredients,
        { ingredientName: "", quantity: "", itemId: null },
      ],
    }));
  }

  function removeIngredient(idx: number) {
    setForm((prev) => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== idx),
    }));
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      toast.error("菜品名稱不能為空");
      return;
    }
    if (!form.category) {
      toast.error("請選擇分類");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        sellPrice: form.sellPrice,
        notes: form.notes.trim() || null,
        ingredients: form.ingredients
          .filter((ig) => ig.ingredientName.trim())
          .map((ig) => ({
            ingredientName: ig.ingredientName.trim(),
            quantity: ig.quantity.trim(),
            itemId: ig.itemId,
          })),
      };

      const url = editTarget ? `/api/bom/${editTarget.id}` : "/api/bom";
      const method = editTarget ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "儲存失敗");
        return;
      }

      onOpenChange(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editTarget ? "編輯菜品配方" : "新增菜品配方"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* 菜品名稱 */}
          <div className="space-y-1.5">
            <Label>菜品名稱 *</Label>
            <Input
              placeholder="例：牛油麻辣鍋(全紅)"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
          </div>

          {/* 分類 + 售價 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>分類 *</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((p) => ({ ...p, category: v ?? "" }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="選擇分類" />
                </SelectTrigger>
                <SelectContent>
                  {BOM_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>售價 ($)</Label>
              <Input
                type="number"
                min={0}
                value={form.sellPrice}
                onChange={(e) =>
                  setForm((p) => ({ ...p, sellPrice: Number(e.target.value) }))
                }
              />
            </div>
          </div>

          {/* 備註 */}
          <div className="space-y-1.5">
            <Label>備註</Label>
            <Input
              placeholder="例：以曜、大韓成本更低"
              value={form.notes}
              onChange={(e) =>
                setForm((p) => ({ ...p, notes: e.target.value }))
              }
            />
          </div>

          {/* BOM 食材明細 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>配方食材</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={addIngredient}
              >
                <Plus className="size-3" />
                加食材
              </Button>
            </div>

            {form.ingredients.map((ig, idx) => {
              const searchText = itemSearch[idx] ?? "";
              const isOpen = dropdownOpen[idx] ?? false;
              const catFilter = ingredientCatFilter[idx] ?? "";
              const selectedItem = ig.itemId
                ? allItems.find((it) => it.id === ig.itemId)
                : null;

              // 篩選：先按分類，再按搜尋文字
              let filtered = catFilter
                ? allItems.filter((it) => it.category === catFilter)
                : allItems;
              if (searchText) {
                filtered = filtered.filter((it) => it.name.includes(searchText));
              }

              // 品項分類列表
              const itemCategories = [...new Set(allItems.map((it) => it.category))].sort();

              return (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-xs text-muted-foreground w-4 shrink-0 mt-2.5">
                    {idx + 1}
                  </span>
                  <div className="flex-1 relative">
                    {selectedItem ? (
                      <div className="flex items-center gap-1 border rounded-md px-2 py-1.5 text-sm bg-muted/30">
                        <Badge variant="outline" className="text-[10px] px-1 shrink-0">
                          {selectedItem.category}
                        </Badge>
                        <span className="font-medium truncate">{selectedItem.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          ${selectedItem.costPrice}/{selectedItem.unit}
                        </span>
                        <button
                          type="button"
                          className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            updateIngredient(idx, "itemId", null);
                            updateIngredient(idx, "ingredientName", "");
                          }}
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div className="flex gap-1.5">
                          {/* 分類下拉 */}
                          <Select
                            value={catFilter || "__all__"}
                            onValueChange={(v) => {
                              setIngredientCatFilter((prev) => ({ ...prev, [idx]: v === "__all__" ? "" : (v ?? "") }));
                              setDropdownOpen((prev) => ({ ...prev, [idx]: true }));
                            }}
                          >
                            <SelectTrigger className="w-24 shrink-0 text-xs">
                              <SelectValue placeholder="分類" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__all__">全部</SelectItem>
                              {itemCategories.map((cat) => (
                                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {/* 搜尋框 */}
                          <Input
                            placeholder="搜尋食材..."
                            value={searchText}
                            onChange={(e) => {
                              setItemSearch((prev) => ({ ...prev, [idx]: e.target.value }));
                              setDropdownOpen((prev) => ({ ...prev, [idx]: true }));
                            }}
                            onFocus={() => setDropdownOpen((prev) => ({ ...prev, [idx]: true }))}
                            className="flex-1"
                          />
                        </div>
                        {isOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen((prev) => ({ ...prev, [idx]: false }))} />
                            <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto bg-card border rounded-md shadow-lg">
                              {filtered.length === 0 ? (
                                <div className="px-3 py-2 text-sm text-muted-foreground">找不到品項</div>
                              ) : (
                                filtered.map((it) => (
                                  <button
                                    key={it.id}
                                    type="button"
                                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted flex items-center justify-between"
                                    onClick={() => {
                                      updateIngredient(idx, "itemId", it.id);
                                      updateIngredient(idx, "ingredientName", it.name);
                                      setItemSearch((prev) => { const n = { ...prev }; delete n[idx]; return n; });
                                      setIngredientCatFilter((prev) => { const n = { ...prev }; delete n[idx]; return n; });
                                      setDropdownOpen((prev) => ({ ...prev, [idx]: false }));
                                    }}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] text-muted-foreground w-10 shrink-0">{it.category}</span>
                                      <span>{it.name}</span>
                                    </div>
                                    <span className="text-xs text-muted-foreground">${it.costPrice}/{it.unit}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <Input
                    placeholder="用量"
                    value={ig.quantity}
                    onChange={(e) => updateIngredient(idx, "quantity", e.target.value)}
                    className="w-24"
                  />
                  {form.ingredients.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0 text-destructive hover:text-destructive mt-0.5"
                      onClick={() => removeIngredient(idx)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "儲存中..." : editTarget ? "儲存變更" : "新增"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 頁面主元件 ──

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
      .catch(() => { setLoading(false); setFetchError(true); });
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const categories = [
    "全部",
    ...Array.from(new Set(data.map((d) => d.category))),
  ];

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

  function handleAdd() {
    setEditTarget(null);
    setDialogOpen(true);
  }

  function handleEdit(item: MenuItemBom) {
    setEditTarget(item);
    setDialogOpen(true);
  }

  async function handleDelete(item: MenuItemBom) {
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
        <Button variant="outline" size="sm" onClick={fetchData}>重試</Button>
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
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            找不到符合的菜品
          </div>
        ) : (
          filtered.map((item) => {
            const isExpanded = expandedIds.has(item.id);
            const catColor =
              CATEGORY_COLORS[item.category] || "bg-gray-100 text-gray-700";

            return (
              <div
                key={item.id}
                className="border rounded-lg bg-card overflow-hidden"
              >
                {/* 菜品標頭 */}
                <div className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors">
                  <button
                    onClick={() => toggleExpand(item.id)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">
                          {item.name}
                        </span>
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

                    {/* 價格區 */}
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold">
                        售 ${item.sellPrice}
                      </div>
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
                      onClick={() => handleEdit(item)}
                      title="編輯"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(item)}
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
                            <th className="text-right py-1 font-normal">
                              單位成本
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {item.ingredients.map((ing, idx) => (
                          <tr
                            key={ing.id}
                            className="border-t border-border/50"
                          >
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

      {/* 新增/編輯 Dialog */}
      <BomDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editTarget={editTarget}
        onSaved={fetchData}
      />

      {/* 刪除確認 Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>確定要刪除？</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            將會刪除「<strong>{deleteTarget?.name}</strong>」及其所有配方明細，此操作無法復原。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" onClick={confirmDelete}>確定刪除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

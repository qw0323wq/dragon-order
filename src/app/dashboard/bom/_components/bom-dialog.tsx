"use client";

/**
 * BOM 新增/編輯 Dialog — 菜品名稱 + 分類 + 售價 + 配方食材（可多筆）
 *
 * 三層架構（2026-06-03 改）：
 *   食材選擇器改成選「ingredient（食材主檔）」而非單一 SKU
 *   - 從 /api/ingredients 拉清單，顯示「貢丸（3 家供應商，主家:綠盛 \$20）」
 *   - 切換主供應商時 BOM 不用改（BOM 綁的是 ingredient_id）
 */

import { useEffect, useState } from "react";
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
import { Plus, X, Star } from "lucide-react";
import type {
  MenuItemBom,
  BomFormData,
  IngredientForm,
  IngredientOption,
} from "./types";
import { BOM_CATEGORIES, EMPTY_FORM } from "./types";

interface BomDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editTarget: MenuItemBom | null;
  onSaved: () => void;
}

export function BomDialog({ open, onOpenChange, editTarget, onSaved }: BomDialogProps) {
  const [form, setForm] = useState<BomFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [allIngredients, setAllIngredients] = useState<IngredientOption[]>([]);
  const [search, setSearch] = useState<Record<number, string>>({});
  const [dropdownOpen, setDropdownOpen] = useState<Record<number, boolean>>({});
  const [catFilter, setCatFilter] = useState<Record<number, string>>({});

  // 載入食材主檔（取代舊的 /api/items）
  useEffect(() => {
    fetch("/api/ingredients")
      .then((r) => r.json())
      .then((data: IngredientOption[]) => setAllIngredients(data))
      .catch(() => toast.error("載入食材清單失敗"));
  }, []);

  useEffect(() => {
    if (open) {
      setSearch({});
      setDropdownOpen({});
      setCatFilter({});
      if (editTarget) {
        setForm({
          name: editTarget.name,
          category: editTarget.category,
          sellPrice: editTarget.sellPrice,
          notes: editTarget.notes || "",
          ingredients:
            editTarget.ingredients.length > 0
              ? editTarget.ingredients.map((ig) => ({
                  ingredientId: ig.ingredientId,
                  ingredientName: ig.ingredientName,
                  quantity: ig.quantity,
                  itemId: ig.itemId,
                  costFactor: ig.costFactor,
                  itemUnit: ig.itemUnit,
                  quantityUnit: ig.quantityUnit,
                  factorKind: ig.factorKind,
                }))
              : [{ ingredientId: null, ingredientName: "", quantity: "", itemId: null, costFactor: null }],
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
        { ingredientId: null, ingredientName: "", quantity: "", itemId: null, costFactor: null },
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
          .filter((ig) => ig.ingredientName.trim() || ig.ingredientId)
          .map((ig) => ({
            ingredientId: ig.ingredientId,
            ingredientName: ig.ingredientName.trim(),
            quantity: ig.quantity.trim(),
            itemId: ig.itemId,
            costFactor: ig.costFactor,
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
              const searchText = search[idx] ?? "";
              const isOpen = dropdownOpen[idx] ?? false;
              const cat = catFilter[idx] ?? "";
              const selectedIng = ig.ingredientId
                ? allIngredients.find((it) => it.id === ig.ingredientId)
                : null;

              // 篩選：先按分類，再按搜尋文字
              let filtered = cat
                ? allIngredients.filter((it) => it.category === cat)
                : allIngredients;
              if (searchText) {
                filtered = filtered.filter((it) => it.name.includes(searchText));
              }
              filtered = filtered.slice(0, 50); // 限制最多 50 筆避免下拉太長

              // 食材分類列表
              const ingCategories = [
                ...new Set(allIngredients.map((it) => it.category).filter((c): c is string => !!c)),
              ].sort();

              // 跨維度單位（顆↔包 等）才顯示換算設定；重量↔重量由後端即時換算
              const showFactor =
                ig.factorKind === "mismatch" || ig.factorKind === "manual";
              // costFactor = 1/N；回推 N 顯示（近整數就顯示整數，避免 8 位小數殘差）
              let yieldN = "";
              if (ig.costFactor && ig.costFactor > 0) {
                const raw = 1 / ig.costFactor;
                const rounded = Math.round(raw);
                yieldN =
                  Math.abs(raw - rounded) / raw < 0.005
                    ? String(rounded)
                    : String(+raw.toFixed(2));
              }
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-start gap-2">
                  <span className="text-xs text-muted-foreground w-4 shrink-0 mt-2.5">
                    {idx + 1}
                  </span>
                  <div className="flex-1 relative">
                    {selectedIng ? (
                      <div className="flex items-center gap-1 border rounded-md px-2 py-1.5 text-sm bg-muted/30">
                        {selectedIng.category && (
                          <Badge variant="outline" className="text-[10px] px-1 shrink-0">
                            {selectedIng.category}
                          </Badge>
                        )}
                        <span className="font-medium truncate">{selectedIng.name}</span>
                        {selectedIng.supplierCount > 0 && (
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            ({selectedIng.supplierCount} 家)
                          </span>
                        )}
                        {selectedIng.primaryCost != null && selectedIng.primarySupplierName && (
                          <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-0.5">
                            <Star className="size-3 fill-yellow-400 text-yellow-500 dark:text-yellow-400" />
                            {selectedIng.primarySupplierName} ${selectedIng.primaryCost}/{selectedIng.unit}
                          </span>
                        )}
                        <button
                          type="button"
                          className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            updateIngredient(idx, "ingredientId", null);
                            updateIngredient(idx, "ingredientName", "");
                            updateIngredient(idx, "itemId", null);
                          }}
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div className="flex gap-1.5">
                          <Select
                            value={cat || "__all__"}
                            onValueChange={(v) => {
                              setCatFilter((prev) => ({ ...prev, [idx]: v === "__all__" ? "" : (v ?? "") }));
                              setDropdownOpen((prev) => ({ ...prev, [idx]: true }));
                            }}
                          >
                            <SelectTrigger className="w-24 shrink-0 text-xs">
                              <SelectValue placeholder="分類" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__all__">全部</SelectItem>
                              {ingCategories.map((c) => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder="搜尋食材..."
                            value={searchText}
                            onChange={(e) => {
                              setSearch((prev) => ({ ...prev, [idx]: e.target.value }));
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
                                <div className="px-3 py-2 text-sm text-muted-foreground">找不到食材</div>
                              ) : (
                                filtered.map((it) => (
                                  <button
                                    key={it.id}
                                    type="button"
                                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted flex items-center justify-between gap-2"
                                    onClick={() => {
                                      updateIngredient(idx, "ingredientId", it.id);
                                      updateIngredient(idx, "ingredientName", it.name);
                                      updateIngredient(idx, "itemId", null); // 改用 ingredient_id
                                      setSearch((prev) => { const n = { ...prev }; delete n[idx]; return n; });
                                      setCatFilter((prev) => { const n = { ...prev }; delete n[idx]; return n; });
                                      setDropdownOpen((prev) => ({ ...prev, [idx]: false }));
                                    }}
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="text-[10px] text-muted-foreground w-10 shrink-0">{it.category}</span>
                                      <span className="truncate">{it.name}</span>
                                      <span className="text-[10px] text-muted-foreground shrink-0">({it.supplierCount}家)</span>
                                    </div>
                                    {it.primaryCost != null && (
                                      <span className="text-xs text-muted-foreground shrink-0">
                                        ${it.primaryCost}/{it.unit}
                                      </span>
                                    )}
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

                  {/* 跨維度單位換算設定（如 5顆 貢丸 vs $650/包） */}
                  {showFactor && (
                    <div className="ml-6 flex flex-wrap items-center gap-1.5 text-xs text-orange-800 bg-orange-50 border border-orange-200 rounded px-2 py-1 dark:text-orange-300 dark:bg-orange-500/15 dark:border-orange-500/30">
                      <span className="shrink-0">單位換算：1 {ig.itemUnit || "計價單位"} =</span>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        placeholder="?"
                        value={yieldN}
                        onChange={(e) => {
                          const n = parseFloat(e.target.value);
                          updateIngredient(
                            idx,
                            "costFactor",
                            Number.isFinite(n) && n > 0 ? 1 / n : null
                          );
                        }}
                        className="h-6 w-20 text-xs"
                      />
                      <span className="shrink-0">{ig.quantityUnit || "用量單位"}</span>
                      {!ig.costFactor && (
                        <span className="shrink-0 text-orange-600 dark:text-orange-400">← 未設定，此食材成本未計入</span>
                      )}
                    </div>
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

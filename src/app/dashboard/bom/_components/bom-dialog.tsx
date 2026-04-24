"use client";

/**
 * BOM 新增/編輯 Dialog — 菜品名稱 + 分類 + 售價 + 配方食材（可多筆）
 * 食材選擇器：分類下拉 + 搜尋 + 下拉清單
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
import { Plus, X } from "lucide-react";
import type { MenuItemBom, BomFormData, IngredientForm, ItemOption } from "./types";
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
  const [allItems, setAllItems] = useState<ItemOption[]>([]);
  const [itemSearch, setItemSearch] = useState<Record<number, string>>({});
  const [dropdownOpen, setDropdownOpen] = useState<Record<number, boolean>>({});
  const [ingredientCatFilter, setIngredientCatFilter] = useState<Record<number, string>>({});

  // 載入品項清單
  useEffect(() => {
    fetch("/api/items")
      .then((r) => r.json())
      .then((data: ItemOption[]) => setAllItems(data))
      .catch(() => toast.error('載入資料失敗'));
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

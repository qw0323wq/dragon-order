"use client";

/**
 * 員工側「食材本位」叫貨 tab — 提叫貨需求
 *
 * 工作流：
 *   1. 員工選門市 → 載入該店食材庫存 + 補貨建議
 *   2. 員工填「現有量」(盤點)、「要叫量」(看建議或自己決定)
 *   3. 可用「補貨建議自動填」一鍵帶入系統建議
 *   4. 可用「從銷量反推」對話框：輸入賣了幾份哪幾道菜 → 自動算需要的食材量
 *   5. 送出 → POST /api/purchase-requests → 老闆在 /dashboard/purchase-plan 看到
 *
 * 員工看不到價格（symmetric 於 /order 既有設計，staff 沒 cost 視角）
 */

import { useEffect, useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import {
  Search,
  Lightbulb,
  Calculator,
  Send,
  Loader2,
  AlertCircle,
  X,
  Plus,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface IngredientRow {
  id: number;
  name: string;
  category: string | null;
  unit: string;
  totalStock: number;
  safetyStock: number;
  last7DaysOutflow: number;
  suggestedQty: number;
  isLow: boolean;
  primarySupplierName: string | null;
}

interface StoreOption {
  id: number;
  name: string;
}

interface MenuItemLite {
  id: number;
  name: string;
  category: string;
}

interface RevBomReply {
  ingredients: Array<{
    ingredientId: number;
    name: string;
    unit: string;
    totalNeeded: number;
  }>;
}

interface Props {
  stores: StoreOption[];
  defaultStoreId?: number | null;
}

export default function IngredientRequestTab({ stores, defaultStoreId }: Props) {
  const [storeId, setStoreId] = useState<number | null>(defaultStoreId ?? stores[0]?.id ?? null);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("全部");
  /** inputs[ingredientId] = { currentStock, neededQty } */
  const [inputs, setInputs] = useState<Record<number, { currentStock: string; neededQty: string }>>({});
  const [submitting, setSubmitting] = useState(false);

  // 反推 dialog
  const [revBomOpen, setRevBomOpen] = useState(false);
  const [revBomMenuItems, setRevBomMenuItems] = useState<MenuItemLite[]>([]);
  const [revBomEntries, setRevBomEntries] = useState<Array<{ menuItemId: number | null; quantity: string }>>([
    { menuItemId: null, quantity: "" },
  ]);
  const [revBomLoading, setRevBomLoading] = useState(false);

  // 載入食材建議（含庫存）
  const loadIngredients = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ingredients/suggestions?storeId=${storeId}`);
      if (!res.ok) {
        toast.error("載入食材清單失敗");
        return;
      }
      const data: IngredientRow[] = await res.json();
      setIngredients(data);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    loadIngredients();
  }, [loadIngredients]);

  // 載入菜單（給「從銷量反推」彈窗用）
  useEffect(() => {
    if (!revBomOpen || revBomMenuItems.length > 0) return;
    fetch("/api/bom")
      .then((r) => r.json())
      .then((data: Array<{ id: number; name: string; category: string; isActive: boolean }>) => {
        setRevBomMenuItems(data.filter((m) => m.isActive).map((m) => ({ id: m.id, name: m.name, category: m.category })));
      })
      .catch(() => toast.error("載入菜單失敗"));
  }, [revBomOpen, revBomMenuItems.length]);

  const categories = useMemo(
    () => [
      "全部",
      ...Array.from(new Set(ingredients.map((i) => i.category).filter((c): c is string => !!c))),
    ],
    [ingredients]
  );

  const filtered = useMemo(() => {
    return ingredients.filter((i) => {
      if (filterCat !== "全部" && i.category !== filterCat) return false;
      if (search && !i.name.includes(search)) return false;
      return true;
    });
  }, [ingredients, filterCat, search]);

  function setIngredientInput(id: number, field: "currentStock" | "neededQty", val: string) {
    setInputs((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { currentStock: "", neededQty: "" }), [field]: val },
    }));
  }

  /** 補貨建議：把 suggestedQty 預填到所有食材的 neededQty */
  function autofillSuggested() {
    const next = { ...inputs };
    let filled = 0;
    for (const ing of ingredients) {
      if (ing.suggestedQty > 0) {
        next[ing.id] = {
          currentStock: next[ing.id]?.currentStock ?? String(ing.totalStock),
          neededQty: String(ing.suggestedQty),
        };
        filled++;
      }
    }
    setInputs(next);
    toast.success(`已預填 ${filled} 個食材的建議叫貨量`);
  }

  /** 從銷量反推：呼叫 /api/sales/reverse-bom，把結果加到 neededQty */
  async function runReverseBom() {
    const validEntries = revBomEntries.filter((e) => e.menuItemId && Number(e.quantity) > 0);
    if (validEntries.length === 0) {
      toast.error("請至少選一個菜品並填銷量");
      return;
    }
    setRevBomLoading(true);
    try {
      const res = await fetch("/api/sales/reverse-bom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: validEntries.map((e) => ({
            menuItemId: e.menuItemId,
            quantity: Number(e.quantity),
          })),
        }),
      });
      if (!res.ok) {
        toast.error("反推失敗");
        return;
      }
      const data: RevBomReply = await res.json();
      // 把 totalNeeded 累加到對應 ingredient 的 neededQty
      const next = { ...inputs };
      let added = 0;
      for (const r of data.ingredients) {
        const cur = next[r.ingredientId]?.neededQty ?? "";
        const curN = parseFloat(cur) || 0;
        next[r.ingredientId] = {
          currentStock: next[r.ingredientId]?.currentStock ?? "",
          neededQty: String(Math.ceil((curN + r.totalNeeded) * 100) / 100),
        };
        added++;
      }
      setInputs(next);
      toast.success(`反推完成：${added} 個食材需求量已加入`);
      setRevBomOpen(false);
      // reset dialog state
      setRevBomEntries([{ menuItemId: null, quantity: "" }]);
    } finally {
      setRevBomLoading(false);
    }
  }

  /** 送出叫貨需求 */
  async function handleSubmit() {
    if (!storeId) {
      toast.error("請選擇門市");
      return;
    }
    const items = ingredients
      .map((ing) => {
        const inp = inputs[ing.id];
        if (!inp) return null;
        const needed = parseFloat(inp.neededQty);
        if (!needed || needed <= 0) return null;
        return {
          ingredientId: ing.id,
          currentStock: parseFloat(inp.currentStock) || 0,
          neededQty: needed,
          unit: ing.unit,
        };
      })
      .filter((x): x is { ingredientId: number; currentStock: number; neededQty: number; unit: string } => !!x);

    if (items.length === 0) {
      toast.error("請至少填一個食材的「要叫量」");
      return;
    }

    if (!confirm(`確定送出 ${items.length} 項食材的叫貨需求？\n老闆會在採購規劃頁看到並決定廠商。`)) {
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/purchase-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, items }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "送出失敗");
        return;
      }
      toast.success("已送出叫貨需求！老闆會處理");
      setInputs({});
    } finally {
      setSubmitting(false);
    }
  }

  const totalLines = useMemo(
    () => Object.values(inputs).filter((v) => parseFloat(v.neededQty) > 0).length,
    [inputs]
  );

  return (
    <div className="space-y-3">
      {/* 工具列 */}
      <div className="flex flex-wrap gap-2 items-center">
        {stores.length > 1 && (
          <Select
            value={storeId ? String(storeId) : ""}
            onValueChange={(v) => setStoreId(v ? Number(v) : null)}
          >
            <SelectTrigger className="w-32 h-9 text-sm">
              <SelectValue placeholder="門市" />
            </SelectTrigger>
            <SelectContent>
              {stores.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="搜尋食材..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCat(cat)}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              filterCat === cat
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-accent"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={autofillSuggested}
          disabled={loading || ingredients.length === 0}
        >
          <Lightbulb className="size-3.5" />
          補貨建議自動填
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setRevBomOpen(true)}
        >
          <Calculator className="size-3.5" />
          從銷量反推
        </Button>
      </div>

      {/* 食材列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            沒有食材
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((ing) => {
            const inp = inputs[ing.id] ?? { currentStock: "", neededQty: "" };
            const hasNeed = parseFloat(inp.neededQty) > 0;
            return (
              <Card
                key={ing.id}
                className={`${ing.isLow ? "border-amber-300" : ""} ${hasNeed ? "ring-1 ring-primary/30" : ""}`}
              >
                <CardContent className="py-2.5 px-3 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {ing.category && (
                      <Badge variant="outline" className="text-[10px]">
                        {ing.category}
                      </Badge>
                    )}
                    <span className="font-medium text-sm">{ing.name}</span>
                    <span className="text-[10px] text-muted-foreground">/{ing.unit}</span>
                    {ing.isLow && (
                      <span className="text-[10px] text-amber-700 flex items-center gap-0.5">
                        <AlertCircle className="size-3" />
                        低於安全庫存
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="text-muted-foreground">系統庫存</span>
                    <span className="font-medium">{ing.totalStock}</span>
                    {ing.safetyStock > 0 && (
                      <span className="text-muted-foreground">/ 安全 {ing.safetyStock}</span>
                    )}
                    {ing.suggestedQty > 0 && (
                      <Badge variant="outline" className="text-[10px] border-blue-200 text-blue-700 bg-blue-50">
                        建議 {ing.suggestedQty}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground shrink-0">現有</label>
                    <Input
                      type="number"
                      min={0}
                      step="0.5"
                      placeholder={String(ing.totalStock)}
                      value={inp.currentStock}
                      onChange={(e) => setIngredientInput(ing.id, "currentStock", e.target.value)}
                      className="w-20 h-8 text-sm text-center"
                    />
                    <label className="text-xs text-muted-foreground shrink-0 ml-2">要叫</label>
                    <Input
                      type="number"
                      min={0}
                      step="0.5"
                      placeholder="0"
                      value={inp.neededQty}
                      onChange={(e) => setIngredientInput(ing.id, "neededQty", e.target.value)}
                      className="w-20 h-8 text-sm text-center"
                    />
                    {ing.primarySupplierName && (
                      <span className="text-[10px] text-muted-foreground truncate">
                        主家：{ing.primarySupplierName}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 送出按鈕（固定下方） */}
      <div className="sticky bottom-2 bg-card border rounded-lg px-3 py-2.5 flex items-center justify-between shadow-lg">
        <div className="text-sm">
          <span className="font-semibold">{totalLines}</span>
          <span className="text-muted-foreground"> 項食材要叫</span>
        </div>
        <Button
          onClick={handleSubmit}
          disabled={submitting || totalLines === 0}
          className="gap-1.5"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          送出叫貨需求
        </Button>
      </div>

      {/* 從銷量反推 dialog */}
      <Dialog open={revBomOpen} onOpenChange={setRevBomOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>從銷量反推食材需求</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              填寫今天賣了幾份哪些菜，系統會自動算出需要的食材量 + 加進「要叫」欄。
            </p>
            {revBomEntries.map((entry, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Select
                  value={entry.menuItemId ? String(entry.menuItemId) : ""}
                  onValueChange={(v) => {
                    const next = [...revBomEntries];
                    next[idx] = { ...next[idx], menuItemId: v ? Number(v) : null };
                    setRevBomEntries(next);
                  }}
                >
                  <SelectTrigger className="flex-1 text-sm">
                    <SelectValue placeholder="選菜品..." />
                  </SelectTrigger>
                  <SelectContent>
                    {revBomMenuItems.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        <span className="text-xs text-muted-foreground">{m.category}</span>{" "}
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0}
                  placeholder="份數"
                  value={entry.quantity}
                  onChange={(e) => {
                    const next = [...revBomEntries];
                    next[idx] = { ...next[idx], quantity: e.target.value };
                    setRevBomEntries(next);
                  }}
                  className="w-20 text-sm"
                />
                {revBomEntries.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive"
                    onClick={() => setRevBomEntries(revBomEntries.filter((_, i) => i !== idx))}
                  >
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => setRevBomEntries([...revBomEntries, { menuItemId: null, quantity: "" }])}
            >
              <Plus className="size-3.5" />
              加菜品
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevBomOpen(false)}>
              取消
            </Button>
            <Button onClick={runReverseBom} disabled={revBomLoading}>
              {revBomLoading ? <Loader2 className="size-4 animate-spin" /> : "計算並加入"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

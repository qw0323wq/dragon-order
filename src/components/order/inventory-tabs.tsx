"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  SearchIcon, Loader2, XIcon, Trash2, UtensilsCrossed, ClipboardCheck,
} from "lucide-react";
import type { MenuItem, Store } from "@/lib/mock-data";

// ─────────────────────────────────────────
// 共用型別
// ─────────────────────────────────────────

interface TabProps {
  items: MenuItem[];
  stores: Store[];
  storeId: number;
  userName: string;
}

// ─────────────────────────────────────────
// 報廢 Tab
// ─────────────────────────────────────────

const WASTE_REASONS = [
  { value: "expired", label: "過期" },
  { value: "damaged", label: "損壞" },
  { value: "other", label: "其他" },
];

export function WasteTab({ items, storeId }: TabProps) {
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("expired");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // 搜尋篩選品項
  const filteredItems = useMemo(() => {
    if (!searchQuery) return items;
    return items.filter(
      (item) =>
        item.name.includes(searchQuery) ||
        item.aliases.some((a) => a.includes(searchQuery))
    );
  }, [items, searchQuery]);

  const selectedItem = items.find((i) => String(i.id) === selectedItemId);

  async function handleSubmit() {
    if (!selectedItemId || !quantity || parseFloat(quantity) <= 0) {
      toast.error("請選擇品項並填入數量");
      return;
    }
    if (!storeId) {
      toast.error("請先在頂部選擇門市");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: parseInt(selectedItemId),
          type: "waste",
          quantity: parseFloat(quantity),
          unit: selectedItem?.unit || null,
          storeId,
          reason,
          notes: notes || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`${data.itemName} 報廢 ${quantity} ${selectedItem?.unit || ""} 完成`);
        setSelectedItemId("");
        setQuantity("");
        setReason("expired");
        setNotes("");
      } else {
        const data = await res.json();
        toast.error(data.error || "報廢失敗");
      }
    } catch {
      toast.error("報廢失敗");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 bg-orange-50 text-orange-700 rounded-xl text-sm font-medium">
        <Trash2 className="size-4 shrink-0" />
        食材報廢登記（過期、損壞等），會自動扣除庫存
      </div>

      {/* 品項搜尋 */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
        <Input
          type="search"
          placeholder="搜尋品項..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-12 text-base rounded-xl"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground p-1"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>

      {/* 品項選擇 */}
      <Select value={selectedItemId} onValueChange={(v) => setSelectedItemId(v ?? "")}>
        <SelectTrigger className="h-12 text-base rounded-xl">
          <SelectValue placeholder="選擇品項" />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {filteredItems.map((item) => (
            <SelectItem key={item.id} value={String(item.id)}>
              {item.name}
              <span className="text-muted-foreground ml-1 text-sm">
                ({item.category})
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 數量 */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Input
            type="number"
            step="0.5"
            min="0"
            placeholder="數量"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="h-12 text-base text-center rounded-xl"
          />
        </div>
        <span className="text-base text-muted-foreground shrink-0 w-12">
          {selectedItem?.unit || "單位"}
        </span>
      </div>

      {/* 原因 */}
      <Select value={reason} onValueChange={(v) => setReason(v ?? "expired")}>
        <SelectTrigger className="h-12 text-base rounded-xl">
          <SelectValue placeholder="報廢原因" />
        </SelectTrigger>
        <SelectContent>
          {WASTE_REASONS.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 備註 */}
      <Input
        placeholder="備註（選填）"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="h-12 text-base rounded-xl"
      />

      <Button
        onClick={handleSubmit}
        className="w-full h-14 text-lg font-bold gap-2 rounded-xl"
        disabled={submitting || !selectedItemId || !quantity}
      >
        {submitting ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <Trash2 className="size-5" />
        )}
        送出報廢
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────
// 員工餐 Tab
// ─────────────────────────────────────────

export function MealTab({ items, storeId, userName }: TabProps) {
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredItems = useMemo(() => {
    if (!searchQuery) return items;
    return items.filter(
      (item) =>
        item.name.includes(searchQuery) ||
        item.aliases.some((a) => a.includes(searchQuery))
    );
  }, [items, searchQuery]);

  const selectedItem = items.find((i) => String(i.id) === selectedItemId);

  async function handleSubmit() {
    if (!selectedItemId || !quantity || parseFloat(quantity) <= 0) {
      toast.error("請選擇品項並填入數量");
      return;
    }
    if (!storeId) {
      toast.error("請先在頂部選擇門市");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: parseInt(selectedItemId),
          type: "meal",
          quantity: parseFloat(quantity),
          unit: selectedItem?.unit || null,
          storeId,
          notes: notes || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`${data.itemName} 員工餐 ${quantity} ${selectedItem?.unit || ""} 已登記`);
        setSelectedItemId("");
        setQuantity("");
        setNotes("");
      } else {
        const data = await res.json();
        toast.error(data.error || "登記失敗");
      }
    } catch {
      toast.error("登記失敗");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 bg-purple-50 text-purple-700 rounded-xl text-sm font-medium">
        <UtensilsCrossed className="size-4 shrink-0" />
        員工用餐登記，會自動扣除庫存
      </div>

      {/* 用餐人 */}
      <div className="flex items-center gap-2 p-3 bg-muted rounded-xl text-base">
        <span className="text-muted-foreground">用餐人：</span>
        <span className="font-semibold">{userName}</span>
      </div>

      {/* 品項搜尋 */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
        <Input
          type="search"
          placeholder="搜尋品項..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-12 text-base rounded-xl"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground p-1"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>

      {/* 品項選擇 */}
      <Select value={selectedItemId} onValueChange={(v) => setSelectedItemId(v ?? "")}>
        <SelectTrigger className="h-12 text-base rounded-xl">
          <SelectValue placeholder="選擇品項" />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          {filteredItems.map((item) => (
            <SelectItem key={item.id} value={String(item.id)}>
              {item.name}
              <span className="text-muted-foreground ml-1 text-sm">
                ({item.category})
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 數量 */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Input
            type="number"
            step="0.5"
            min="0"
            placeholder="數量"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="h-12 text-base text-center rounded-xl"
          />
        </div>
        <span className="text-base text-muted-foreground shrink-0 w-12">
          {selectedItem?.unit || "單位"}
        </span>
      </div>

      {/* 備註 */}
      <Input
        placeholder="備註（選填）"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="h-12 text-base rounded-xl"
      />

      <Button
        onClick={handleSubmit}
        className="w-full h-14 text-lg font-bold gap-2 rounded-xl"
        disabled={submitting || !selectedItemId || !quantity}
      >
        {submitting ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <UtensilsCrossed className="size-5" />
        )}
        送出登記
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────
// 盤點 Tab
// ─────────────────────────────────────────

interface InventoryItem {
  id: number;
  name: string;
  category: string;
  unit: string;
  current_stock: number;
}

export function StocktakeTab({ storeId }: TabProps) {
  const [loading, setLoading] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 載入庫存資料
  async function loadInventory() {
    if (!storeId) {
      toast.error("請先在頂部選擇門市");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory?store=${storeId}`);
      if (res.ok) {
        const data: InventoryItem[] = await res.json();
        setInventoryItems(data);
        setLoaded(true);
        // 預填空值
        const initial: Record<number, string> = {};
        for (const item of data) {
          initial[item.id] = "";
        }
        setCounts(initial);
      } else {
        toast.error("載入庫存失敗");
      }
    } catch {
      toast.error("載入庫存失敗");
    } finally {
      setLoading(false);
    }
  }

  // 篩選品項
  const categories = useMemo(() => {
    const cats = new Set(inventoryItems.map((i) => i.category));
    return Array.from(cats).sort();
  }, [inventoryItems]);

  const filteredInventory = useMemo(() => {
    return inventoryItems.filter((item) => {
      const matchCat = !categoryFilter || item.category === categoryFilter;
      const matchSearch = !searchQuery || item.name.includes(searchQuery);
      return matchCat && matchSearch;
    });
  }, [inventoryItems, categoryFilter, searchQuery]);

  // 計算有填寫的品項數
  const filledCount = Object.values(counts).filter(
    (v) => v !== "" && v !== undefined
  ).length;

  async function handleSubmit() {
    // 只送有填寫的品項
    const toSubmit = Object.entries(counts)
      .filter(([, val]) => val !== "" && val !== undefined)
      .map(([id, val]) => ({
        itemId: parseInt(id),
        actualStock: parseFloat(val),
      }));

    if (toSubmit.length === 0) {
      toast.error("請至少填寫一個品項的實際庫存");
      return;
    }

    setSubmitting(true);
    let successCount = 0;
    let failCount = 0;

    for (const entry of toSubmit) {
      try {
        const item = inventoryItems.find((i) => i.id === entry.itemId);
        const res = await fetch("/api/inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: entry.itemId,
            type: "adjust",
            quantity: entry.actualStock,
            unit: item?.unit || null,
            storeId,
            source: "定期盤點",
          }),
        });
        if (res.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`盤點完成：${successCount} 項已更新`);
    }
    if (failCount > 0) {
      toast.error(`${failCount} 項更新失敗`);
    }

    // 重新載入
    await loadInventory();
    setSubmitting(false);
  }

  if (!loaded) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 p-3 bg-blue-50 text-blue-700 rounded-xl text-sm font-medium">
          <ClipboardCheck className="size-4 shrink-0" />
          盤點實際庫存，系統會自動調整差異
        </div>
        <Button
          onClick={loadInventory}
          className="w-full h-14 text-lg font-bold gap-2 rounded-xl"
          disabled={loading || !storeId}
        >
          {loading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <ClipboardCheck className="size-5" />
          )}
          {!storeId ? "請先選擇門市" : "開始盤點"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 p-3 bg-blue-50 text-blue-700 rounded-xl text-sm font-medium">
        <ClipboardCheck className="size-4 shrink-0" />
        填入實際庫存數量，留空 = 不調整
      </div>

      {/* 篩選 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="搜尋..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-10 text-sm rounded-xl"
          />
        </div>
        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? "")}>
          <SelectTrigger className="w-28 h-10 text-sm rounded-xl">
            <SelectValue placeholder="全部" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">全部</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 品項列表 */}
      <div className="space-y-1">
        {filteredInventory.map((item) => {
          const diff =
            counts[item.id] !== "" && counts[item.id] !== undefined
              ? parseFloat(counts[item.id]) - item.current_stock
              : null;

          return (
            <div
              key={item.id}
              className="flex items-center gap-2 p-3 bg-card border border-border rounded-xl"
            >
              <div className="flex-1 min-w-0">
                <div className="text-base font-medium truncate">{item.name}</div>
                <div className="text-sm text-muted-foreground">
                  系統：{item.current_stock} {item.unit}
                  {diff !== null && diff !== 0 && (
                    <span
                      className={`ml-2 font-semibold ${diff > 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {diff > 0 ? "+" : ""}
                      {diff.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
              <Input
                type="number"
                step="0.5"
                min="0"
                placeholder="實際"
                value={counts[item.id] || ""}
                onChange={(e) =>
                  setCounts((prev) => ({
                    ...prev,
                    [item.id]: e.target.value,
                  }))
                }
                className="w-20 h-11 text-center text-base rounded-xl"
              />
              <span className="text-sm text-muted-foreground w-10 shrink-0">
                {item.unit}
              </span>
            </div>
          );
        })}
      </div>

      {/* 送出 */}
      <Button
        onClick={handleSubmit}
        className="w-full h-14 text-lg font-bold gap-2 rounded-xl"
        disabled={submitting || filledCount === 0}
      >
        {submitting ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <ClipboardCheck className="size-5" />
        )}
        送出盤點（{filledCount} 項）
      </Button>
    </div>
  );
}

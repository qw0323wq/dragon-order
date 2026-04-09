"use client";

import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  SearchIcon, Loader2, XIcon, Trash2, UtensilsCrossed, ClipboardCheck,
  CheckCircle2,
} from "lucide-react";
import type { MenuItem, Store } from "@/lib/mock-data";

// ─────────────────────────────────────────
// 共用
// ─────────────────────────────────────────

interface TabProps {
  items: MenuItem[];
  stores: Store[];
  storeId: number;
  userName: string;
}

/** 最近使用品項（localStorage） */
const RECENT_WASTE_KEY = "dragon-order-recent-waste";
const RECENT_MEAL_KEY = "dragon-order-recent-meal";
const MAX_RECENT = 6;

function getRecentIds(key: string): number[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(key) || "[]"); }
  catch { return []; }
}
function saveRecentIds(key: string, ids: number[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(ids.slice(0, MAX_RECENT)));
}

/** 快捷數量按鈕 */
function QuickQtyButtons({ onSelect }: { onSelect: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      {[1, 2, 5, 10].map((v) => (
        <button
          key={v}
          onClick={() => onSelect(String(v))}
          className="shrink-0 w-12 h-12 rounded-xl bg-muted text-sm font-bold border border-border active:bg-accent transition-colors"
        >
          {v}
        </button>
      ))}
    </div>
  );
}

/** 品項搜尋列表（取代 Select 下拉） */
function ItemSearchList({
  items,
  searchQuery,
  setSearchQuery,
  selectedItemId,
  setSelectedItemId,
  recentIds,
  allItems,
}: {
  items: MenuItem[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  selectedItemId: string;
  setSelectedItemId: (v: string) => void;
  recentIds: number[];
  allItems: MenuItem[];
}) {
  const recentItems = useMemo(() =>
    recentIds.map(id => allItems.find(i => i.id === id)).filter((i): i is MenuItem => !!i),
    [recentIds, allItems]
  );

  const selectedItem = allItems.find((i) => String(i.id) === selectedItemId);

  return (
    <>
      {/* 搜尋框 */}
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

      {/* 已選擇的品項 */}
      {selectedItem && !searchQuery && (
        <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-xl">
          <CheckCircle2 className="size-5 text-primary shrink-0" />
          <span className="text-base font-semibold flex-1">{selectedItem.name}</span>
          <button
            onClick={() => setSelectedItemId("")}
            className="text-muted-foreground p-1"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      )}

      {/* 最近使用（沒搜尋、沒選擇時顯示） */}
      {!searchQuery && !selectedItemId && recentItems.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground font-medium px-1">最近使用</span>
          <div className="flex flex-wrap gap-2">
            {recentItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedItemId(String(item.id))}
                className="px-3 py-2 rounded-xl border border-border bg-card text-sm font-medium active:bg-accent transition-colors"
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 搜尋結果列表（有搜尋詞時顯示） */}
      {searchQuery && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {items.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground text-sm">找不到品項</div>
          ) : (
            items.slice(0, 12).map((item) => (
              <button
                key={item.id}
                onClick={() => { setSelectedItemId(String(item.id)); setSearchQuery(""); }}
                className={`w-full flex justify-between items-center px-4 h-12 rounded-xl border text-left transition-colors active:bg-accent ${
                  selectedItemId === String(item.id)
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border bg-card"
                }`}
              >
                <span className="font-medium text-base">{item.name}</span>
                <span className="text-muted-foreground text-sm">{item.category}</span>
              </button>
            ))
          )}
        </div>
      )}
    </>
  );
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
  const [recentIds, setRecentIds] = useState<number[]>([]);

  useEffect(() => { setRecentIds(getRecentIds(RECENT_WASTE_KEY)); }, []);

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
        // 更新最近使用
        const id = parseInt(selectedItemId);
        setRecentIds((prev) => {
          const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENT);
          saveRecentIds(RECENT_WASTE_KEY, next);
          return next;
        });
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

      {/* 品項搜尋+選擇（合併為列表模式） */}
      <ItemSearchList
        items={filteredItems}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedItemId={selectedItemId}
        setSelectedItemId={setSelectedItemId}
        recentIds={recentIds}
        allItems={items}
      />

      {/* 數量 + 快捷按鈕 */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Input
              type="text"
              inputMode="decimal"
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
        <QuickQtyButtons onSelect={setQuantity} />
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
        {submitting ? <Loader2 className="size-5 animate-spin" /> : <Trash2 className="size-5" />}
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
  const [recentIds, setRecentIds] = useState<number[]>([]);

  useEffect(() => { setRecentIds(getRecentIds(RECENT_MEAL_KEY)); }, []);

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
        const id = parseInt(selectedItemId);
        setRecentIds((prev) => {
          const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENT);
          saveRecentIds(RECENT_MEAL_KEY, next);
          return next;
        });
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

      {/* 品項搜尋+選擇 */}
      <ItemSearchList
        items={filteredItems}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedItemId={selectedItemId}
        setSelectedItemId={setSelectedItemId}
        recentIds={recentIds}
        allItems={items}
      />

      {/* 數量 + 快捷按鈕 */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Input
              type="text"
              inputMode="decimal"
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
        <QuickQtyButtons onSelect={setQuantity} />
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
        {submitting ? <Loader2 className="size-5 animate-spin" /> : <UtensilsCrossed className="size-5" />}
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
  const [progress, setProgress] = useState({ current: 0, total: 0 });

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

  const filledCount = Object.values(counts).filter(
    (v) => v !== "" && v !== undefined
  ).length;

  async function handleSubmit() {
    const toSubmit = Object.entries(counts)
      .filter(([, val]) => val !== "" && val !== undefined)
      .map(([id, val]) => {
        const item = inventoryItems.find((it) => it.id === parseInt(id));
        return {
          itemId: parseInt(id),
          quantity: parseFloat(val),
          unit: item?.unit || undefined,
        };
      });

    if (toSubmit.length === 0) {
      toast.error("請至少填寫一個品項的實際庫存");
      return;
    }

    setSubmitting(true);
    setProgress({ current: 0, total: toSubmit.length });

    try {
      // CRITICAL: 一次批次送出，不再逐筆 fetch（100 品項從 100 次 → 1 次）
      const res = await fetch("/api/inventory/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          items: toSubmit,
          source: "定期盤點",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setProgress({ current: toSubmit.length, total: toSubmit.length });
        toast.success(`盤點完成：${data.updated} 項已更新（${toSubmit.length - data.updated} 項無差異跳過）`);
      } else {
        const data = await res.json().catch(() => ({ error: "盤點失敗" }));
        toast.error(data.error || "盤點失敗，請重試");
      }
    } catch {
      toast.error("網路錯誤，盤點失敗");
    }

    await loadInventory();
    setSubmitting(false);
    setProgress({ current: 0, total: 0 });
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
          {loading ? <Loader2 className="size-5 animate-spin" /> : <ClipboardCheck className="size-5" />}
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
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
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
                    <span className={`ml-2 font-semibold ${diff > 0 ? "text-green-600" : "text-red-600"}`}>
                      {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="實際"
                value={counts[item.id] || ""}
                onChange={(e) =>
                  setCounts((prev) => ({ ...prev, [item.id]: e.target.value }))
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

      {/* 送出（含進度） */}
      <Button
        onClick={handleSubmit}
        className="w-full h-14 text-lg font-bold gap-2 rounded-xl"
        disabled={submitting || filledCount === 0}
      >
        {submitting ? (
          <>
            <Loader2 className="size-5 animate-spin" />
            {progress.total > 0 ? `${progress.current} / ${progress.total}` : "送出中..."}
          </>
        ) : (
          <>
            <ClipboardCheck className="size-5" />
            送出盤點（{filledCount} 項）
          </>
        )}
      </Button>
    </div>
  );
}

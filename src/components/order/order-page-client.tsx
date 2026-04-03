"use client";

import { useState, useEffect, useMemo, useTransition, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { logout } from "@/app/actions/auth";
import type { SessionUser } from "@/app/actions/auth";
import type { MenuItem, Store } from "@/lib/mock-data";
import { ALL_CATEGORIES, CATEGORY_COLORS } from "@/lib/mock-data";
import type { CartItem } from "@/lib/cart";
import {
  addToCart,
  updateCartQuantity,
  removeFromCart,
  calcCartTotal,
  calcCartCount,
} from "@/lib/cart";
import { parseOrderText } from "@/lib/text-parser";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  LogOutIcon, SearchIcon, ShoppingCartIcon, PlusIcon,
  ScanTextIcon, SendIcon, XIcon, ArrowLeftIcon, CalendarIcon,
  ClipboardList, ClipboardCheck, CheckCircle2, AlertTriangle, Loader2,
  ChevronDownIcon, ChevronUpIcon, Clock, Trash2, UtensilsCrossed, PackageCheck,
  MoreHorizontal, AlertTriangleIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ItemCard } from "./item-card";
import { ParsedLineCard } from "./parsed-line-card";
import { CartItemRow } from "./cart-item-row";
import { WasteTab, MealTab, StocktakeTab } from "./inventory-tabs";

interface OrderPageClientProps {
  user: SessionUser;
  items: MenuItem[];
  stores: Store[];
}

// 最近叫過的品項 localStorage key
const RECENT_ITEMS_KEY = "dragon-order-recent-items";
const MAX_RECENT = 8;

function getRecentItemIds(): number[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_ITEMS_KEY) || "[]");
  } catch { return []; }
}

function saveRecentItemIds(ids: number[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(ids.slice(0, MAX_RECENT)));
}

/**
 * 叫貨頁主要互動元件
 * 包含：頂部 header、分類/搜尋/品項列表、文字模式、購物車 Sheet
 */
export default function OrderPageClient({
  user,
  items,
  stores,
}: OrderPageClientProps) {
  const router = useRouter();

  // 選取的門市 ID
  const [selectedStoreId, setSelectedStoreId] = useState<string>(
    user.store_id ? String(user.store_id) : ""
  );

  // 分類篩選
  const [activeCategory, setActiveCategory] = useState<string>("");

  // 訂單日期
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));

  // 搜尋
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  // 購物車
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // 各品項「待加入數量」
  const [itemQuantities, setItemQuantities] = useState<Record<number, number>>({});

  // 文字模式
  const [orderText, setOrderText] = useState("");
  const [parsedLines, setParsedLines] = useState<ReturnType<typeof parseOrderText>>([]);
  const [hasParsed, setHasParsed] = useState(false);

  const [isPending, startTransition] = useTransition();

  // Tab 切換
  const [activeTab, setActiveTab] = useState("list");

  // Header 收合
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const lastScrollY = useRef(0);
  const mainRef = useRef<HTMLDivElement>(null);

  // 分類展開
  const [categoryExpanded, setCategoryExpanded] = useState(false);

  // 最近叫過的品項
  const [recentIds, setRecentIds] = useState<number[]>([]);
  useEffect(() => { setRecentIds(getRecentItemIds()); }, []);

  // 滾動偵測：自動收合 header
  useEffect(() => {
    function handleScroll() {
      const y = window.scrollY;
      if (y > 100 && y > lastScrollY.current) {
        setHeaderCollapsed(true);
      } else if (y < lastScrollY.current - 10) {
        setHeaderCollapsed(false);
      }
      lastScrollY.current = y;
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // 篩選品項
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchCategory = !activeCategory || item.category === activeCategory;
      const matchSearch =
        !searchQuery ||
        item.name.includes(searchQuery) ||
        item.aliases.some((a) => a.includes(searchQuery));
      return matchCategory && matchSearch;
    });
  }, [items, activeCategory, searchQuery]);

  // 分類數量
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }
    return counts;
  }, [items]);

  // 最近叫過的品項列表
  const recentItems = useMemo(() => {
    return recentIds
      .map(id => items.find(i => i.id === id))
      .filter((i): i is MenuItem => !!i);
  }, [recentIds, items]);

  // 購物車中各品項數量（快速查詢用）
  const cartQtyMap = useMemo(() => {
    const map: Record<number, number> = {};
    for (const ci of cartItems) {
      map[ci.item.id] = ci.quantity;
    }
    return map;
  }, [cartItems]);

  const cartTotal = calcCartTotal(cartItems);
  const cartCount = calcCartCount(cartItems);

  function getItemQty(itemId: number): number {
    return itemQuantities[itemId] ?? 1;
  }

  function setItemQty(itemId: number, qty: number) {
    setItemQuantities((prev) => ({
      ...prev,
      [itemId]: Math.max(1, qty),
    }));
  }

  /** 加入購物車（指定數量） */
  const handleAddToCart = useCallback((item: MenuItem) => {
    const qty = itemQuantities[item.id] ?? 1;
    setCartItems((prev) => addToCart(prev, item, qty));
    setItemQuantities((prev) => ({ ...prev, [item.id]: 1 }));
    // 更新最近叫過
    setRecentIds(prev => {
      const next = [item.id, ...prev.filter(id => id !== item.id)].slice(0, MAX_RECENT);
      saveRecentItemIds(next);
      return next;
    });
    toast.success(`${item.name} × ${qty} 已加入`, { duration: 1500 });
  }, [itemQuantities]);

  /** 快速 +1 加入購物車 */
  const handleQuickAdd = useCallback((item: MenuItem) => {
    setCartItems((prev) => addToCart(prev, item, 1));
    setRecentIds(prev => {
      const next = [item.id, ...prev.filter(id => id !== item.id)].slice(0, MAX_RECENT);
      saveRecentItemIds(next);
      return next;
    });
    toast.success(`${item.name} +1`, { duration: 1200 });
  }, []);

  function handleCartQtyChange(itemId: number, quantity: number) {
    setCartItems((prev) => updateCartQuantity(prev, itemId, quantity));
  }

  function handleCartRemove(itemId: number) {
    setCartItems((prev) => removeFromCart(prev, itemId));
  }

  function handleParseText() {
    const results = parseOrderText(orderText, items);
    setParsedLines(results);
    setHasParsed(true);
    if (results.length === 0) toast.error("請輸入叫貨內容");
  }

  function handleAddAllParsed() {
    const matched = parsedLines.filter((l) => l.item !== null);
    if (matched.length === 0) { toast.error("沒有可辨識的品項"); return; }
    let newCart = cartItems;
    for (const line of matched) {
      if (line.item) newCart = addToCart(newCart, line.item, line.quantity);
    }
    setCartItems(newCart);
    toast.success(`已加入 ${matched.length} 個品項`);
    setOrderText("");
    setParsedLines([]);
    setHasParsed(false);
  }

  async function handleSubmitOrder() {
    if (!selectedStoreId) { toast.error("請先選擇門市"); return; }
    if (cartItems.length === 0) { toast.error("購物車是空的"); return; }
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: parseInt(selectedStoreId),
          userId: user.id,
          orderDate,
          items: cartItems.map((c) => ({
            itemId: c.item.id,
            quantity: c.quantity,
            unit: c.item.unit,
            unitPrice: c.item.cost_price,
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "送出失敗");
        return;
      }
      toast.success("叫貨單已送出！");
      setCartItems([]);
      setIsCartOpen(false);
    } catch {
      toast.error("送出失敗，請重試");
    }
  }

  function handleLogout() {
    startTransition(() => logout());
  }

  // 可見的分類（收合時只顯示前 6 個）
  const visibleCategories = useMemo(() => {
    const withCounts = ALL_CATEGORIES.filter(c => (categoryCounts[c] || 0) > 0);
    return categoryExpanded ? withCounts : withCounts.slice(0, 6);
  }, [categoryCounts, categoryExpanded]);

  const totalCategoriesWithItems = ALL_CATEGORIES.filter(c => (categoryCounts[c] || 0) > 0).length;

  return (
    <>
      {/* ===== 頂部 Header ===== */}
      <header className={`sticky top-0 z-40 bg-card border-b border-border shadow-sm transition-all duration-300 ${headerCollapsed ? '-translate-y-full' : 'translate-y-0'}`}>
        {/* 品牌紅線 */}
        <div className="h-1 bg-primary" />
        {/* 第一行：返回 + 名字 + 登出 */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 size-9 text-muted-foreground"
            onClick={() => router.back()}
            aria-label="返回上一頁"
          >
            <ArrowLeftIcon className="size-5" />
          </Button>
          <span className="text-lg font-bold text-foreground leading-tight">
            嗨，{user.name}！
          </span>
          <div className="flex items-center gap-1 ml-auto">
            <CalendarIcon className="size-4 text-muted-foreground" />
            <input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="text-sm text-muted-foreground bg-transparent border-none p-0 focus:outline-none w-28"
              max={new Date().toISOString().slice(0, 10)}
            />
            {orderDate !== new Date().toISOString().slice(0, 10) && (
              <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold">
                補單
              </span>
            )}
            <Button variant="ghost" size="icon" className="size-9 shrink-0 text-muted-foreground" onClick={handleLogout} aria-label="登出">
              <LogOutIcon className="size-4" />
            </Button>
          </div>
        </div>
        {/* 第二行：門市 */}
        <div className="px-4 pb-3">
          {user.store_id ? (
            <div className="h-11 flex items-center px-4 text-sm font-semibold bg-muted rounded-xl">
              {stores.find(s => s.id === user.store_id)?.name || '門市'}
            </div>
          ) : (
            <Select value={selectedStoreId} onValueChange={(v) => setSelectedStoreId(v ?? "")}>
              <SelectTrigger className="h-11 w-full text-sm rounded-xl" aria-label="選擇門市">
                <SelectValue placeholder="選擇門市" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.id} value={String(store.id)}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </header>

      {/* Header 收合時的迷你 bar */}
      {headerCollapsed && (
        <div
          className="sticky top-0 z-40 bg-card/95 backdrop-blur-sm border-b border-border px-4 py-2 flex items-center justify-between cursor-pointer"
          onClick={() => { setHeaderCollapsed(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
        >
          <span className="text-sm font-semibold text-foreground">
            {stores.find(s => String(s.id) === selectedStoreId)?.name || user.name}
          </span>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarIcon className="size-3" />
            {orderDate.slice(5)}
            <ChevronDownIcon className="size-3" />
          </div>
        </div>
      )}

      {/* ===== 主要內容 ===== */}
      <main ref={mainRef} className="px-3 pt-3 pb-28">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Tab 切換列：前 4 個固定 + 「更多」收納後 3 個 */}
          <div className="flex items-center gap-1.5 mb-3">
            <TabsList className="flex-1">
              <TabsTrigger value="list" className="flex-1 gap-1 text-sm">
                <ShoppingCartIcon className="size-4" />
                叫貨
              </TabsTrigger>
              <TabsTrigger value="text" className="flex-1 gap-1 text-sm">
                <ScanTextIcon className="size-4" />
                文字
              </TabsTrigger>
              <TabsTrigger value="my-orders" className="flex-1 gap-1 text-sm">
                <ClipboardList className="size-4" />
                訂單
              </TabsTrigger>
              <TabsTrigger value="receiving" className="flex-1 gap-1 text-sm">
                <ClipboardCheck className="size-4" />
                驗收
              </TabsTrigger>
            </TabsList>

            {/* 更多功能下拉選單 */}
            <DropdownMenu>
              <DropdownMenuTrigger className={`shrink-0 flex items-center justify-center size-10 rounded-xl border transition-colors cursor-pointer ${
                  ['waste', 'meal', 'stocktake'].includes(activeTab)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted text-muted-foreground border-border hover:bg-accent'
                }`}>
                <MoreHorizontal className="size-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => setActiveTab('waste')} className="gap-2 text-base py-3">
                  <Trash2 className="size-4 text-orange-500" />
                  報廢
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveTab('meal')} className="gap-2 text-base py-3">
                  <UtensilsCrossed className="size-4 text-purple-500" />
                  員工餐
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveTab('stocktake')} className="gap-2 text-base py-3">
                  <PackageCheck className="size-4 text-blue-500" />
                  盤點
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* ===== Tab 1: 清單模式 ===== */}
          <TabsContent value="list">
            {/* 搜尋框（浮動展開） */}
            {showSearch ? (
              <div className="relative mb-3">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="搜尋品項..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-12 text-base rounded-xl"
                  autoFocus
                />
                <button
                  onClick={() => { setShowSearch(false); setSearchQuery(""); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground p-1"
                  aria-label="關閉搜尋"
                >
                  <XIcon className="size-5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-3">
                {/* 分類 Grid */}
                <div className="flex-1 flex flex-wrap gap-2">
                  <button
                    onClick={() => setActiveCategory("")}
                    className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors ${
                      activeCategory === ""
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    全部 ({items.length})
                  </button>
                  {visibleCategories.map((label) => {
                    const count = categoryCounts[label] || 0;
                    return (
                      <button
                        key={label}
                        onClick={() => setActiveCategory(activeCategory === label ? "" : label)}
                        className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors ${
                          activeCategory === label
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-muted text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {label} ({count})
                      </button>
                    );
                  })}
                  {/* 展開/收合更多分類 */}
                  {totalCategoriesWithItems > 6 && (
                    <button
                      onClick={() => setCategoryExpanded(!categoryExpanded)}
                      className="px-2 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors"
                    >
                      {categoryExpanded ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
                    </button>
                  )}
                </div>

                {/* 搜尋浮動按鈕 */}
                <button
                  onClick={() => setShowSearch(true)}
                  className="shrink-0 size-11 rounded-xl bg-muted flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors"
                  aria-label="搜尋"
                >
                  <SearchIcon className="size-5" />
                </button>
              </div>
            )}

            {/* 最近叫過（沒有搜尋、沒有分類篩選時才顯示） */}
            {!searchQuery && !activeCategory && recentItems.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-1.5 mb-2 px-1">
                  <Clock className="size-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-muted-foreground">最近叫過</span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none" style={{ scrollbarWidth: "none" }}>
                  {recentItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleQuickAdd(item)}
                      className={`shrink-0 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95 ${
                        cartQtyMap[item.id]
                          ? 'bg-primary/10 text-primary border border-primary/20'
                          : 'bg-card border border-border shadow-xs'
                      }`}
                    >
                      {item.name}
                      {cartQtyMap[item.id] ? (
                        <span className="ml-1.5 text-xs font-bold">×{cartQtyMap[item.id]}</span>
                      ) : (
                        <PlusIcon className="inline size-3.5 ml-1 -mt-0.5" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 品項列表 */}
            <div className="flex flex-col gap-2">
              {filteredItems.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground text-base">
                  找不到符合的品項
                </div>
              ) : (
                filteredItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    quantity={getItemQty(item.id)}
                    showPrice={user.role === "admin" || user.role === "buyer"}
                    cartQty={cartQtyMap[item.id] || 0}
                    onQuantityChange={(qty) => setItemQty(item.id, qty)}
                    onAddToCart={() => handleAddToCart(item)}
                    onQuickAdd={() => handleQuickAdd(item)}
                  />
                ))
              )}
            </div>
          </TabsContent>

          {/* ===== Tab 2: 文字模式 ===== */}
          <TabsContent value="text">
            <div className="flex flex-col gap-3">
              <Textarea
                placeholder={"輸入叫貨內容，例如：\n五花10斤\n蝦5包\n霜降牛3斤"}
                value={orderText}
                onChange={(e) => setOrderText(e.target.value)}
                className="min-h-[180px] text-lg leading-relaxed resize-none rounded-xl"
              />

              <Button
                onClick={handleParseText}
                variant="outline"
                className="h-12 gap-2 text-base rounded-xl"
                disabled={!orderText.trim()}
              >
                <ScanTextIcon className="size-5" />
                解析叫貨內容
              </Button>

              {hasParsed && parsedLines.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">
                      解析結果（{parsedLines.filter((l) => l.item).length}/{parsedLines.length} 成功）
                    </span>
                    <Button
                      size="sm"
                      onClick={handleAddAllParsed}
                      className="h-9 gap-1.5 text-sm rounded-xl"
                    >
                      <PlusIcon className="size-4" />
                      全部加入
                    </Button>
                  </div>
                  {parsedLines.map((line, idx) => (
                    <ParsedLineCard key={idx} line={line} />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ===== Tab 3: 我的訂單 ===== */}
          <TabsContent value="my-orders">
            <MyOrdersTab userId={user.id} storeId={parseInt(selectedStoreId) || 0} />
          </TabsContent>

          {/* ===== Tab 4: 驗收 ===== */}
          <TabsContent value="receiving">
            <ReceivingTab storeId={parseInt(selectedStoreId) || 0} />
          </TabsContent>

          {/* ===== Tab 5: 報廢 ===== */}
          <TabsContent value="waste">
            <WasteTab
              items={items}
              stores={stores}
              storeId={parseInt(selectedStoreId) || 0}
              userName={user.name}
            />
          </TabsContent>

          {/* ===== Tab 6: 員工餐 ===== */}
          <TabsContent value="meal">
            <MealTab
              items={items}
              stores={stores}
              storeId={parseInt(selectedStoreId) || 0}
              userName={user.name}
            />
          </TabsContent>

          {/* ===== Tab 7: 盤點 ===== */}
          <TabsContent value="stocktake">
            <StocktakeTab
              items={items}
              stores={stores}
              storeId={parseInt(selectedStoreId) || 0}
              userName={user.name}
            />
          </TabsContent>
        </Tabs>
      </main>

      {/* ===== 底部固定購物車 Bar ===== */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur-sm border-t border-border px-4 pt-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
        <button
          onClick={() => setIsCartOpen(true)}
          className="w-full flex items-center justify-between bg-primary text-primary-foreground rounded-2xl px-5 py-3.5 transition-all active:scale-[0.98] shadow-lg"
          aria-label={`開啟購物車，共 ${cartCount} 件`}
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <ShoppingCartIcon className="size-6" />
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-white text-primary text-xs font-bold rounded-full size-5 flex items-center justify-center leading-none shadow-sm">
                  {cartCount > 99 ? "99+" : cartCount}
                </span>
              )}
            </div>
            <span className="font-bold text-base">
              {cartItems.length === 0
                ? "購物車是空的"
                : `${cartItems.length} 種品項`}
            </span>
          </div>
          <div className="text-base font-bold">
            {cartCount > 0
              ? (user.role !== "staff" && cartTotal > 0 ? `$${cartTotal.toLocaleString()}` : `${cartCount} 件`)
              : "查看"}
          </div>
        </button>
      </div>

      {/* ===== 購物車 Sheet ===== */}
      <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] flex flex-col rounded-t-2xl">
          <SheetHeader className="pb-2">
            <SheetTitle className="text-lg">
              購物車
              {cartItems.length > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {cartItems.length} 種品項
                </span>
              )}
            </SheetTitle>
          </SheetHeader>

          {cartItems.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-base">
              購物車是空的，快去加品項吧！
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto flex flex-col gap-2 py-2">
                {cartItems.map((ci) => (
                  <CartItemRow
                    key={ci.item.id}
                    cartItem={ci}
                    showPrice={user.role === "admin" || user.role === "buyer"}
                    onQuantityChange={(qty) => handleCartQtyChange(ci.item.id, qty)}
                    onRemove={() => handleCartRemove(ci.item.id)}
                  />
                ))}
              </div>

              <Separator />

              {(user.role === "admin" || user.role === "buyer") && cartTotal > 0 && (
                <div className="flex items-center justify-between py-3 text-sm">
                  <span className="text-muted-foreground">預估採購成本</span>
                  <span className="font-bold text-lg text-primary">
                    ${cartTotal.toLocaleString()}
                  </span>
                </div>
              )}
            </>
          )}

          <SheetFooter className="flex-col gap-2">
            {/* 門市未選時在 Sheet 內提示選擇 */}
            {!selectedStoreId && (
              <div className="flex items-center gap-2 p-3 bg-orange-50 rounded-xl w-full">
                <AlertTriangleIcon className="size-5 text-orange-500 shrink-0" />
                <Select value={selectedStoreId} onValueChange={(v) => setSelectedStoreId(v ?? "")}>
                  <SelectTrigger className="flex-1 h-11 rounded-xl text-base">
                    <SelectValue placeholder="請先選擇門市" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((store) => (
                      <SelectItem key={store.id} value={String(store.id)}>{store.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button
              onClick={handleSubmitOrder}
              className="w-full h-14 text-lg font-bold gap-2 rounded-xl"
              disabled={cartItems.length === 0 || !selectedStoreId}
            >
              <SendIcon className="size-5" />
              {!selectedStoreId ? "請先選擇門市" : "送出叫貨單"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

// ── 我的訂單 Tab ──
function MyOrdersTab({ userId, storeId }: { userId: number; storeId: number }) {
  const [orders, setOrders] = useState<Array<{
    id: number; orderDate: string; status: string; totalAmount: number
    items: Array<{ itemName: string; quantity: string; unit: string }>
  }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    fetch('/api/my-orders')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        if (Array.isArray(data)) setOrders(data)
        else { setOrders([]); setError('資料格式異常') }
      })
      .catch(e => { setOrders([]); setError(`載入失敗：${e.message}`) })
      .finally(() => setLoading(false))
  }, [userId, storeId])

  const STATUS: Record<string, { label: string; color: string }> = {
    draft: { label: '編輯中', color: 'bg-yellow-100 text-yellow-700' },
    submitted: { label: '已送出', color: 'bg-blue-100 text-blue-700' },
    ordered: { label: '已叫貨', color: 'bg-purple-100 text-purple-700' },
    receiving: { label: '待驗收', color: 'bg-orange-100 text-orange-700' },
    received: { label: '已驗收', color: 'bg-green-100 text-green-700' },
    closed: { label: '已結案', color: 'bg-muted text-muted-foreground' },
  }

  async function handleSubmitOrder(orderId: number) {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit' }),
    })
    if (res.ok) {
      toast.success('訂單已送出')
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'submitted' } : o))
    } else {
      const data = await res.json()
      toast.error(data.error || '送出失敗')
    }
  }

  const [expandedId, setExpandedId] = useState<number | null>(null)

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
  if (error) return <div className="text-center py-12 text-red-500 text-base">{error}</div>
  if (orders.length === 0) return <div className="text-center py-12 text-muted-foreground text-base">尚無訂單紀錄</div>

  return (
    <div className="space-y-3">
      {orders.map(o => {
        const st = STATUS[o.status] || STATUS.draft
        const isExpanded = expandedId === o.id
        return (
          <div key={o.id} className="bg-card border border-border rounded-xl overflow-hidden">
            <button className="w-full p-4 text-left flex items-center justify-between"
              onClick={() => setExpandedId(isExpanded ? null : o.id)}>
              <div className="flex items-center gap-3">
                <span className="text-base font-semibold">{o.orderDate?.slice(5)}</span>
                <Badge className={`text-xs ${st.color}`}>{st.label}</Badge>
                <span className="text-sm text-muted-foreground">{o.items.length} 項</span>
              </div>
              <ChevronDownIcon className={`size-5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>

            {isExpanded && (
              <div className="border-t border-border px-4 pb-4">
                {o.items.length > 0 ? (
                  <div className="divide-y divide-border/50">
                    {o.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between py-3 text-base">
                        <span className="font-medium">{item.itemName}</span>
                        <span className="text-muted-foreground">{parseFloat(item.quantity)} {item.unit}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground py-3">（此訂單無本店品項）</div>
                )}
                {o.status === 'draft' && (
                  <Button size="default" className="w-full mt-3 h-12 gap-2 text-base rounded-xl" onClick={() => handleSubmitOrder(o.id)}>
                    <SendIcon className="size-4" /> 送出訂單
                  </Button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── 驗收 Tab ──

interface RecInput { receivedQty: string; result: string; issue: string }

const RESULT_OPTIONS = ['正常', '短缺', '品質問題', '未到貨']
const RESULT_COLORS: Record<string, string> = { 正常: 'text-green-600', 短缺: 'text-yellow-600', 品質問題: 'text-red-600', 未到貨: 'text-muted-foreground' }

function ReceivingTab({ storeId }: { storeId: number }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [items, setItems] = useState<Array<{
    orderItemId: number; itemName: string; quantity: string; unit: string
    supplierName: string; isReceived: boolean; receivedResult?: string
  }>>([])
  const [inputs, setInputs] = useState<Record<number, RecInput>>({})
  const [submitting, setSubmitting] = useState(false)

  function loadData() {
    setLoading(true)
    setError('')
    const today = new Date().toISOString().slice(0, 10)
    fetch(`/api/orders?date=${today}&limit=1`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(async (ords) => {
        if (ords.length === 0) { setItems([]); return }
        const ord = ords[0]
        const recRes = await fetch(`/api/receiving?orderId=${ord.id}`)
        if (!recRes.ok) throw new Error(`HTTP ${recRes.status}`)
        const { details, receivings } = await recRes.json()
        const recMap = new Map<number, { result: string }>()
        for (const r of (receivings || [])) recMap.set(r.orderItemId, r)
        const myItems = (details || [])
          .filter((d: { storeId: number }) => d.storeId === storeId)
          .map((d: { orderItemId: number; itemName: string; quantity: string; unit: string; supplierName: string }) => {
            const rec = recMap.get(d.orderItemId)
            return {
              orderItemId: d.orderItemId, itemName: d.itemName, quantity: d.quantity,
              unit: d.unit, supplierName: d.supplierName,
              isReceived: !!rec, receivedResult: rec?.result,
            }
          })
        setItems(myItems)
        const newInputs: Record<number, RecInput> = {}
        for (const item of myItems) {
          newInputs[item.orderItemId] = { receivedQty: item.quantity, result: '正常', issue: '' }
        }
        setInputs(newInputs)
      })
      .catch((e) => { setError(`載入失敗：${e.message}`) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [storeId])

  function updateInput(id: number, field: keyof RecInput, value: string) {
    setInputs(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  async function handleSubmitSupplier(supplierItems: typeof items) {
    const toSubmit = supplierItems.filter(i => !i.isReceived)
    if (toSubmit.length === 0) { toast.error('此供應商已全部驗收'); return }
    setSubmitting(true)
    try {
      const records = toSubmit.map(i => {
        const input = inputs[i.orderItemId] || { receivedQty: i.quantity, result: '正常', issue: '' }
        return {
          orderItemId: i.orderItemId,
          receivedQty: input.receivedQty || i.quantity,
          result: input.result || '正常',
          issue: input.issue || null,
        }
      })
      const res = await fetch('/api/receiving', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      })
      if (res.ok) {
        toast.success(`已驗收 ${toSubmit.length} 項`)
        setItems(prev => prev.map(i => {
          const submitted = toSubmit.find(s => s.orderItemId === i.orderItemId)
          if (submitted) return { ...i, isReceived: true, receivedResult: inputs[i.orderItemId]?.result || '正常' }
          return i
        }))
      } else { toast.error('驗收失敗') }
    } catch { toast.error('驗收失敗') }
    finally { setSubmitting(false) }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
  if (error) return (
    <div className="text-center py-12 space-y-3">
      <AlertTriangleIcon className="size-8 text-orange-500 mx-auto" />
      <p className="text-base text-red-500">{error}</p>
      <Button variant="outline" onClick={loadData} className="h-11 rounded-xl gap-2">
        <Loader2 className="size-4" /> 重新載入
      </Button>
    </div>
  )
  if (items.length === 0) return <div className="text-center py-12 text-muted-foreground text-base">今天沒有待驗收的品項</div>

  const bySupplier = new Map<string, typeof items>()
  for (const item of items) {
    const list = bySupplier.get(item.supplierName) || []
    list.push(item)
    bySupplier.set(item.supplierName, list)
  }

  const allDone = items.every(i => i.isReceived)
  const receivedCount = items.filter(i => i.isReceived).length

  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-base font-semibold ${
        allDone ? 'bg-green-50 text-green-700' : 'bg-muted text-muted-foreground'
      }`}>
        {allDone ? <CheckCircle2 className="size-5" /> : <AlertTriangle className="size-5" />}
        {allDone ? '全部驗收完成！' : `驗收進度：${receivedCount} / ${items.length} 項`}
      </div>

      {Array.from(bySupplier.entries()).map(([supplier, supplierItems]) => {
        const supplierDone = supplierItems.every(i => i.isReceived)
        return (
          <div key={supplier} className={`bg-card border rounded-xl overflow-hidden ${supplierDone ? 'border-green-200' : 'border-border'}`}>
            <div className="px-4 py-3 bg-muted/30 flex items-center justify-between">
              <span className="font-semibold text-base">{supplier}</span>
              {supplierDone && <Badge className="bg-green-100 text-green-700 text-xs">已驗收</Badge>}
            </div>
            <div className="divide-y">
              {supplierItems.map(item => {
                const input = inputs[item.orderItemId]
                const orderedQty = parseFloat(item.quantity)
                return (
                  <div key={item.orderItemId} className={`px-4 py-3 space-y-2 flex gap-3 ${item.isReceived ? 'bg-green-50/50' : ''}`}>
                    <div className={`w-1 rounded-full shrink-0 self-stretch ${item.isReceived ? 'bg-green-400' : 'bg-transparent'}`} />
                    <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className={`text-base font-medium ${item.isReceived ? 'line-through text-muted-foreground' : ''}`}>{item.itemName}</span>
                        <span className="text-sm text-muted-foreground ml-2">訂 {orderedQty} {item.unit}</span>
                      </div>
                      {item.isReceived && (
                        <span className={`text-sm font-semibold ${RESULT_COLORS[item.receivedResult || '正常']}`}>
                          {item.receivedResult || '正常'} ✓
                        </span>
                      )}
                    </div>

                    {!item.isReceived && input && (
                      <div className="flex items-center gap-2">
                        <input
                          type="number" step="0.5" min="0"
                          className="w-20 h-11 text-center text-base border border-border rounded-xl bg-transparent"
                          value={input.receivedQty}
                          onChange={e => updateInput(item.orderItemId, 'receivedQty', e.target.value)}
                          placeholder={String(orderedQty)}
                        />
                        <span className="text-sm text-muted-foreground shrink-0">{item.unit}</span>

                        <Select value={input.result} onValueChange={v => updateInput(item.orderItemId, 'result', v ?? '正常')}>
                          <SelectTrigger className="flex-1 h-11 text-sm rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {RESULT_OPTIONS.map(opt => (
                              <SelectItem key={opt} value={opt}>
                                <span className={RESULT_COLORS[opt]}>{opt}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {!item.isReceived && input && input.result !== '正常' && (
                      <input
                        className="w-full h-11 text-base px-3 border border-border rounded-xl bg-transparent"
                        placeholder="異常說明..."
                        value={input.issue}
                        onChange={e => updateInput(item.orderItemId, 'issue', e.target.value)}
                      />
                    )}
                    </div>{/* end flex-1 wrapper */}
                  </div>
                )
              })}
            </div>

            {!supplierDone && (
              <div className="px-4 pb-4">
                <Button className="w-full h-12 gap-2 text-base rounded-xl" onClick={() => handleSubmitSupplier(supplierItems)} disabled={submitting}>
                  {submitting ? <Loader2 className="size-5 animate-spin" /> : <ClipboardCheck className="size-5" />}
                  確認驗收（{supplier}）
                </Button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

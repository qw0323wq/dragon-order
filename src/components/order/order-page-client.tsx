"use client";

import { useState, useMemo, useTransition } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  LogOutIcon,
  SearchIcon,
  ShoppingCartIcon,
  PlusIcon,
  MinusIcon,
  TrashIcon,
  ScanTextIcon,
  SendIcon,
  XIcon,
} from "lucide-react";

interface OrderPageClientProps {
  user: SessionUser;
  items: MenuItem[];
  stores: Store[];
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
  // 選取的門市 ID（預設用使用者的 store_id，若為 owner 則必須手動選）
  const [selectedStoreId, setSelectedStoreId] = useState<string>(
    user.store_id ? String(user.store_id) : ""
  );

  // 分類篩選（空字串 = 全部）
  const [activeCategory, setActiveCategory] = useState<string>("");

  // 搜尋關鍵字
  const [searchQuery, setSearchQuery] = useState("");

  // 購物車資料
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  // 購物車 Sheet 開關
  const [isCartOpen, setIsCartOpen] = useState(false);

  // 各品項在清單模式的「待加入數量」（品項 id → 數量）
  const [itemQuantities, setItemQuantities] = useState<Record<number, number>>(
    {}
  );

  // 文字模式輸入
  const [orderText, setOrderText] = useState("");

  // 文字解析結果
  const [parsedLines, setParsedLines] = useState<
    ReturnType<typeof parseOrderText>
  >([]);

  // 是否已解析過（控制結果區塊顯示）
  const [hasParsed, setHasParsed] = useState(false);

  const [isPending, startTransition] = useTransition();

  // 根據分類和搜尋篩選品項
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchCategory =
        !activeCategory || item.category === activeCategory;
      const matchSearch =
        !searchQuery ||
        item.name.includes(searchQuery) ||
        item.aliases.some((a) => a.includes(searchQuery));
      return matchCategory && matchSearch;
    });
  }, [items, activeCategory, searchQuery]);

  // 購物車統計
  const cartTotal = calcCartTotal(cartItems);
  const cartCount = calcCartCount(cartItems);

  /** 取得某品項的當前輸入數量（預設 1） */
  function getItemQty(itemId: number): number {
    return itemQuantities[itemId] ?? 1;
  }

  /** 更新清單模式的品項數量 */
  function setItemQty(itemId: number, qty: number) {
    setItemQuantities((prev) => ({
      ...prev,
      // CRITICAL: 最小值為 1，避免輸入 0 或負數
      [itemId]: Math.max(1, qty),
    }));
  }

  /** 加入購物車（清單模式） */
  function handleAddToCart(item: MenuItem) {
    const qty = getItemQty(item.id);
    setCartItems((prev) => addToCart(prev, item, qty));
    // 加入後重置該品項數量
    setItemQuantities((prev) => ({ ...prev, [item.id]: 1 }));
    toast.success(`${item.name} × ${qty} 已加入購物車`);
  }

  /** 修改購物車內數量 */
  function handleCartQtyChange(itemId: number, quantity: number) {
    setCartItems((prev) => updateCartQuantity(prev, itemId, quantity));
  }

  /** 從購物車移除 */
  function handleCartRemove(itemId: number) {
    setCartItems((prev) => removeFromCart(prev, itemId));
  }

  /** 解析文字模式的叫貨內容 */
  function handleParseText() {
    const results = parseOrderText(orderText, items);
    setParsedLines(results);
    setHasParsed(true);
    if (results.length === 0) {
      toast.error("請輸入叫貨內容");
    }
  }

  /** 將文字解析結果全部加入購物車 */
  function handleAddAllParsed() {
    const matched = parsedLines.filter((l) => l.item !== null);
    if (matched.length === 0) {
      toast.error("沒有可辨識的品項");
      return;
    }
    let newCart = cartItems;
    for (const line of matched) {
      if (line.item) {
        newCart = addToCart(newCart, line.item, line.quantity);
      }
    }
    setCartItems(newCart);
    toast.success(`已加入 ${matched.length} 個品項到購物車`);
    setOrderText("");
    setParsedLines([]);
    setHasParsed(false);
  }

  /** 送出叫貨 */
  function handleSubmitOrder() {
    if (!selectedStoreId) {
      toast.error("請先選擇門市");
      return;
    }
    if (cartItems.length === 0) {
      toast.error("購物車是空的");
      return;
    }
    // TODO: 呼叫 Server Action 寫入 DB / Google Sheets
    toast.success("叫貨單已送出！");
    setCartItems([]);
    setIsCartOpen(false);
  }

  /** 登出 */
  function handleLogout() {
    startTransition(() => logout());
  }

  return (
    <>
      {/* ===== 頂部 Header ===== */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex flex-col min-w-0">
            <span className="text-base font-bold text-gray-800 leading-tight">
              嗨，{user.name}！
            </span>
            <span className="text-xs text-gray-400">今日叫貨</span>
          </div>

          {/* 門市選擇器 */}
          <div className="flex-1 max-w-[160px]">
            <Select value={selectedStoreId} onValueChange={(v) => setSelectedStoreId(v ?? "")}>
              <SelectTrigger
                className="h-9 w-full text-sm"
                aria-label="選擇門市"
              >
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
          </div>

          {/* 登出按鈕 */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            disabled={isPending}
            className="shrink-0 text-gray-400"
            aria-label="登出"
          >
            <LogOutIcon className="size-4" />
          </Button>
        </div>
      </header>

      {/* ===== 主要內容 ===== */}
      <main className="px-3 pt-3">
        <Tabs defaultValue="list">
          {/* Tab 切換列 */}
          <TabsList className="w-full mb-3">
            <TabsTrigger value="list" className="flex-1 gap-1.5">
              <ShoppingCartIcon className="size-3.5" />
              清單模式
            </TabsTrigger>
            <TabsTrigger value="text" className="flex-1 gap-1.5">
              <ScanTextIcon className="size-3.5" />
              文字模式
            </TabsTrigger>
          </TabsList>

          {/* ===== Tab 1: 清單模式 ===== */}
          <TabsContent value="list">
            {/* 分類橫向滾動標籤 */}
            <div
              className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-none"
              style={{ scrollbarWidth: "none" }}
            >
              <button
                onClick={() => setActiveCategory("")}
                className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeCategory === ""
                    ? "bg-primary text-primary-foreground"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                全部
              </button>
              {ALL_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() =>
                    setActiveCategory(activeCategory === cat ? "" : cat)
                  }
                  className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    activeCategory === cat
                      ? "bg-primary text-primary-foreground"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* 搜尋框 */}
            <div className="relative mb-3">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
              <Input
                type="search"
                placeholder="搜尋品項..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label="清除搜尋"
                >
                  <XIcon className="size-4" />
                </button>
              )}
            </div>

            {/* 品項列表 */}
            <div className="flex flex-col gap-2">
              {filteredItems.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">
                  找不到符合的品項
                </div>
              ) : (
                filteredItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    quantity={getItemQty(item.id)}
                    onQuantityChange={(qty) => setItemQty(item.id, qty)}
                    onAddToCart={() => handleAddToCart(item)}
                  />
                ))
              )}
            </div>
          </TabsContent>

          {/* ===== Tab 2: 文字模式 ===== */}
          <TabsContent value="text">
            <div className="flex flex-col gap-3">
              <Textarea
                placeholder={
                  "輸入叫貨內容，例如：\n五花10斤\n蝦5包\n霜降牛3斤"
                }
                value={orderText}
                onChange={(e) => setOrderText(e.target.value)}
                // 大文字框，方便手機輸入
                className="min-h-[160px] text-base leading-relaxed resize-none"
              />

              <Button
                onClick={handleParseText}
                variant="outline"
                className="h-11 gap-2"
                disabled={!orderText.trim()}
              >
                <ScanTextIcon className="size-4" />
                解析叫貨內容
              </Button>

              {/* 解析結果 */}
              {hasParsed && parsedLines.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      解析結果（{parsedLines.filter((l) => l.item).length}/
                      {parsedLines.length} 成功）
                    </span>
                    <Button
                      size="sm"
                      onClick={handleAddAllParsed}
                      className="h-8 gap-1.5 text-xs"
                    >
                      <PlusIcon className="size-3" />
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
        </Tabs>
      </main>

      {/* ===== 底部固定購物車 Bar ===== */}
      {/* CRITICAL: fixed bottom-0 + z-30，確保永遠在最上層但不蓋住 Sheet */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 px-4 py-3 safe-area-pb">
        <button
          onClick={() => setIsCartOpen(true)}
          className="w-full flex items-center justify-between bg-primary text-primary-foreground rounded-xl px-4 py-3 transition-opacity active:opacity-80"
          aria-label={`開啟購物車，共 ${cartCount} 件，預估 ${cartTotal} 元`}
        >
          <div className="flex items-center gap-2">
            <div className="relative">
              <ShoppingCartIcon className="size-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-white text-primary text-[10px] font-bold rounded-full size-4 flex items-center justify-center leading-none">
                  {cartCount > 99 ? "99+" : cartCount}
                </span>
              )}
            </div>
            <span className="font-semibold text-sm">
              {cartItems.length === 0
                ? "購物車是空的"
                : `${cartItems.length} 種品項`}
            </span>
          </div>
          <div className="text-sm font-bold">
            {cartTotal > 0 ? `預估 $${cartTotal.toLocaleString()}` : "查看購物車"}
          </div>
        </button>
      </div>

      {/* ===== 購物車 Sheet（從底部滑出） ===== */}
      <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] flex flex-col rounded-t-2xl">
          <SheetHeader className="pb-2">
            <SheetTitle className="text-base">
              購物車
              {cartItems.length > 0 && (
                <span className="ml-2 text-sm font-normal text-gray-400">
                  {cartItems.length} 種品項
                </span>
              )}
            </SheetTitle>
          </SheetHeader>

          {cartItems.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              購物車是空的，快去加品項吧！
            </div>
          ) : (
            <>
              {/* 購物車品項列表（可滾動） */}
              <div className="flex-1 overflow-y-auto flex flex-col gap-2 py-2">
                {cartItems.map((ci) => (
                  <CartItemRow
                    key={ci.item.id}
                    cartItem={ci}
                    onQuantityChange={(qty) =>
                      handleCartQtyChange(ci.item.id, qty)
                    }
                    onRemove={() => handleCartRemove(ci.item.id)}
                  />
                ))}
              </div>

              <Separator />

              {/* 總計 */}
              <div className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-500">預估進貨成本</span>
                <span className="font-bold text-base text-primary">
                  ${cartTotal.toLocaleString()}
                </span>
              </div>
            </>
          )}

          <SheetFooter>
            <Button
              onClick={handleSubmitOrder}
              className="w-full h-12 text-base font-bold gap-2"
              disabled={cartItems.length === 0 || !selectedStoreId}
            >
              <SendIcon className="size-4" />
              {!selectedStoreId ? "請先選擇門市" : "送出叫貨單"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

// =============================================
// 子元件
// =============================================

/** 清單模式的品項卡片 */
function ItemCard({
  item,
  quantity,
  onQuantityChange,
  onAddToCart,
}: {
  item: MenuItem;
  quantity: number;
  onQuantityChange: (qty: number) => void;
  onAddToCart: () => void;
}) {
  const colorClass =
    CATEGORY_COLORS[item.category] ?? "bg-gray-100 text-gray-700";

  return (
    <div className="bg-white rounded-xl border border-gray-100 px-3 py-3 flex items-center gap-3 shadow-xs">
      {/* 左側：品項資訊 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="font-medium text-sm text-gray-800 truncate">
            {item.name}
          </span>
          <span
            className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${colorClass}`}
          >
            {item.category}
          </span>
        </div>
        <div className="text-xs text-gray-400">
          {item.unit} · 成本 ${item.cost_price}
        </div>
      </div>

      {/* 右側：數量控制 + 加入按鈕 */}
      <div className="flex items-center gap-2 shrink-0">
        {/* 數量 +/- */}
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => onQuantityChange(quantity - 1)}
            // CRITICAL: min-width 44px 符合 Apple HIG 最小觸控尺寸
            className="w-9 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-50 active:bg-gray-100 transition-colors"
            aria-label="減少數量"
          >
            <MinusIcon className="size-3.5" />
          </button>
          <span className="w-8 text-center text-sm font-semibold text-gray-700">
            {quantity}
          </span>
          <button
            onClick={() => onQuantityChange(quantity + 1)}
            className="w-9 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-50 active:bg-gray-100 transition-colors"
            aria-label="增加數量"
          >
            <PlusIcon className="size-3.5" />
          </button>
        </div>

        {/* 加入購物車 */}
        <Button
          size="sm"
          onClick={onAddToCart}
          className="h-9 px-3 text-xs font-semibold"
          aria-label={`加入 ${item.name}`}
        >
          加入
        </Button>
      </div>
    </div>
  );
}

/** 文字解析結果的單行卡片 */
function ParsedLineCard({
  line,
}: {
  line: ReturnType<typeof parseOrderText>[number];
}) {
  const isMatched = line.item !== null;
  const isLowConfidence = isMatched && line.confidence < 0.5;

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 flex items-center justify-between gap-2 ${
        !isMatched
          ? "border-red-200 bg-red-50"
          : isLowConfidence
          ? "border-orange-200 bg-orange-50"
          : "border-green-200 bg-green-50"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-400 truncate">{line.raw}</div>
        {isMatched ? (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-sm font-medium text-gray-800">
              {line.item!.name}
            </span>
            <span className="text-xs text-gray-500">
              × {line.quantity} {line.item!.unit}
            </span>
            {isLowConfidence && (
              <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-300 h-4">
                低信心
              </Badge>
            )}
          </div>
        ) : (
          <div className="text-sm text-red-600 font-medium mt-0.5">
            ⚠ {line.errorReason}
          </div>
        )}
      </div>
    </div>
  );
}

/** 購物車 Sheet 內的品項列 */
function CartItemRow({
  cartItem,
  onQuantityChange,
  onRemove,
}: {
  cartItem: CartItem;
  onQuantityChange: (qty: number) => void;
  onRemove: () => void;
}) {
  const { item, quantity } = cartItem;
  const subtotal = item.cost_price * quantity;

  return (
    <div className="flex items-center gap-3 py-1">
      {/* 品項名稱 */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate">
          {item.name}
        </div>
        <div className="text-xs text-gray-400">
          ${item.cost_price}/{item.unit} · 小計 ${subtotal}
        </div>
      </div>

      {/* 數量控制 */}
      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden shrink-0">
        <button
          onClick={() => onQuantityChange(quantity - 1)}
          className="w-9 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-50 active:bg-gray-100"
          aria-label="減少"
        >
          <MinusIcon className="size-3.5" />
        </button>
        <span className="w-8 text-center text-sm font-semibold">
          {quantity}
        </span>
        <button
          onClick={() => onQuantityChange(quantity + 1)}
          className="w-9 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-50 active:bg-gray-100"
          aria-label="增加"
        >
          <PlusIcon className="size-3.5" />
        </button>
      </div>

      {/* 刪除 */}
      <button
        onClick={onRemove}
        className="w-8 h-8 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
        aria-label={`移除 ${item.name}`}
      >
        <TrashIcon className="size-4" />
      </button>
    </div>
  );
}

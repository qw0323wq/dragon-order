"use client";

/**
 * 我的訂單 Tab — 顯示當前使用者的歷史訂單列表
 * 從 order-page-client.tsx 拆分出來
 */
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Loader2,
  SendIcon,
  ChevronDownIcon,
  ClipboardListIcon,
  AlertTriangleIcon,
  PackageOpenIcon,
} from "lucide-react";

const STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: "編輯中", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400" },
  submitted: { label: "已送出", color: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400" },
  ordered: { label: "已叫貨", color: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400" },
  receiving: { label: "待驗收", color: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400" },
  received: { label: "已驗收", color: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400" },
  closed: { label: "已結案", color: "bg-muted text-muted-foreground" },
};

interface OrderItem {
  itemName: string;
  quantity: string;
  unit: string;
}

interface Order {
  id: number;
  orderDate: string;
  status: string;
  totalAmount: number;
  items: OrderItem[];
}

export function MyOrdersTab({ userId, storeId }: { userId: number; storeId: number }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch("/api/my-orders")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setOrders(data);
        else {
          setOrders([]);
          setError("資料格式異常");
        }
      })
      .catch((e) => {
        setOrders([]);
        setError(`載入失敗：${e.message}`);
      })
      .finally(() => setLoading(false));
  }, [userId, storeId]);

  async function handleSubmitOrder(orderId: number) {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit" }),
    });
    if (res.ok) {
      toast.success("訂單已送出");
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: "submitted" } : o))
      );
    } else {
      const data = await res.json();
      toast.error(data.error || "送出失敗");
    }
  }

  if (loading)
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (error)
    return (
      <EmptyState
        icon={AlertTriangleIcon}
        title="載入訂單失敗"
        description={`${error}。請確認網路連線後，下拉重新整理頁面再試一次。`}
      />
    );
  if (orders.length === 0)
    return (
      <EmptyState
        icon={ClipboardListIcon}
        title="尚無訂單紀錄"
        description="切到「叫貨」分頁挑選品項並送出，訂單就會出現在這裡，可以隨時查看進度。"
      />
    );

  return (
    <div className="space-y-3">
      {orders.map((o) => {
        const st = STATUS[o.status] || STATUS.draft;
        const isExpanded = expandedId === o.id;
        return (
          <div
            key={o.id}
            className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden transition-shadow hover:shadow-sm"
          >
            <button
              className="w-full min-h-14 px-3 py-3 sm:px-4 text-left flex items-center justify-between gap-2 transition-colors hover:bg-muted/30 active:bg-muted/50"
              onClick={() => setExpandedId(isExpanded ? null : o.id)}
              aria-expanded={isExpanded}
            >
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <span className="font-heading text-base font-semibold tabular-nums shrink-0">
                  {o.orderDate?.slice(5)}
                </span>
                <Badge className={`text-xs shrink-0 ${st.color}`}>{st.label}</Badge>
                <span className="text-sm text-muted-foreground tabular-nums shrink-0">
                  {o.items.length} 項
                </span>
              </div>
              <ChevronDownIcon
                className={`size-5 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
              />
            </button>

            {isExpanded && (
              <div className="border-t border-border px-3 pb-4 sm:px-4">
                {o.items.length > 0 ? (
                  <div className="divide-y divide-border/50">
                    {o.items.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-3 py-3 text-base transition-colors hover:bg-muted/30 -mx-2 px-2 rounded-lg"
                      >
                        <span className="font-medium min-w-0 break-words">
                          {item.itemName}
                        </span>
                        <span className="text-muted-foreground text-right tabular-nums shrink-0">
                          {parseFloat(item.quantity)} {item.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={PackageOpenIcon}
                    title="此訂單無本店品項"
                    description="這張訂單的品項屬於其他門市，你的門市這次沒有叫貨。"
                    className="py-6"
                  />
                )}
                {o.status === "draft" && (
                  <Button
                    size="default"
                    className="w-full mt-3 h-12 gap-2 text-base rounded-xl"
                    onClick={() => handleSubmitOrder(o.id)}
                  >
                    <SendIcon className="size-4" /> 送出訂單
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

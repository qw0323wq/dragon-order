"use client";

/**
 * 我的訂單 Tab — 顯示當前使用者的歷史訂單列表
 * 從 order-page-client.tsx 拆分出來
 */
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, SendIcon, ChevronDownIcon } from "lucide-react";

const STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: "編輯中", color: "bg-yellow-100 text-yellow-700" },
  submitted: { label: "已送出", color: "bg-blue-100 text-blue-700" },
  ordered: { label: "已叫貨", color: "bg-purple-100 text-purple-700" },
  receiving: { label: "待驗收", color: "bg-orange-100 text-orange-700" },
  received: { label: "已驗收", color: "bg-green-100 text-green-700" },
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
      <div className="text-center py-12 text-red-500 text-base">{error}</div>
    );
  if (orders.length === 0)
    return (
      <div className="text-center py-12 text-muted-foreground text-base">
        尚無訂單紀錄
      </div>
    );

  return (
    <div className="space-y-3">
      {orders.map((o) => {
        const st = STATUS[o.status] || STATUS.draft;
        const isExpanded = expandedId === o.id;
        return (
          <div
            key={o.id}
            className="bg-card border border-border rounded-xl overflow-hidden"
          >
            <button
              className="w-full p-4 text-left flex items-center justify-between"
              onClick={() => setExpandedId(isExpanded ? null : o.id)}
            >
              <div className="flex items-center gap-3">
                <span className="text-base font-semibold">
                  {o.orderDate?.slice(5)}
                </span>
                <Badge className={`text-xs ${st.color}`}>{st.label}</Badge>
                <span className="text-sm text-muted-foreground">
                  {o.items.length} 項
                </span>
              </div>
              <ChevronDownIcon
                className={`size-5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
              />
            </button>

            {isExpanded && (
              <div className="border-t border-border px-4 pb-4">
                {o.items.length > 0 ? (
                  <div className="divide-y divide-border/50">
                    {o.items.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between py-3 text-base"
                      >
                        <span className="font-medium">{item.itemName}</span>
                        <span className="text-muted-foreground">
                          {parseFloat(item.quantity)} {item.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground py-3">
                    （此訂單無本店品項）
                  </div>
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

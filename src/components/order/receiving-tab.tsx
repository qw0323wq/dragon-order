"use client";

/**
 * 驗收 Tab — 按供應商分組顯示今日待驗收品項
 * 從 order-page-client.tsx 拆分出來
 */
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  ClipboardCheck,
  AlertTriangle,
  AlertTriangleIcon,
} from "lucide-react";

interface RecInput {
  receivedQty: string;
  /** 退貨數量（result='品質問題' 時才會用；整批退就 = receivedQty） */
  returnedQty: string;
  result: string;
  issue: string;
}

interface ReceivingItem {
  orderItemId: number;
  itemName: string;
  quantity: string;
  unit: string;
  supplierName: string;
  orderDate: string;
  isReceived: boolean;
  receivedResult?: string;
}

const RESULT_OPTIONS = ["正常", "短缺", "品質問題", "未到貨"];
const RESULT_COLORS: Record<string, string> = {
  正常: "text-green-600",
  短缺: "text-yellow-600",
  品質問題: "text-red-600",
  未到貨: "text-muted-foreground",
};

export function ReceivingTab({ storeId }: { storeId: number }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState<ReceivingItem[]>([]);
  const [inputs, setInputs] = useState<Record<number, RecInput>>({});
  const [submitting, setSubmitting] = useState(false);

  function loadData() {
    setLoading(true);
    setError("");
    // CRITICAL: 用 /api/receiving/pending 撈「近 7 天所有未驗收」品項（跨多張訂單、跨多天）。
    // 舊版只抓當天最新一張訂單，拆單產生的其他張 + 隔天到貨會漏掉。
    fetch(`/api/receiving/pending?storeId=${storeId}&days=7`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { items: Array<{ orderItemId: number; itemName: string; quantity: string; unit: string; supplierName: string; orderDate: string }> }) => {
        const myItems: ReceivingItem[] = (data.items || []).map((d) => ({
          orderItemId: d.orderItemId,
          itemName: d.itemName,
          quantity: d.quantity,
          unit: d.unit,
          supplierName: d.supplierName,
          orderDate: d.orderDate,
          isReceived: false, // pending endpoint 只回未驗收的
        }));
        setItems(myItems);
        const newInputs: Record<number, RecInput> = {};
        for (const item of myItems) {
          newInputs[item.orderItemId] = {
            receivedQty: item.quantity,
            returnedQty: "0",
            result: "正常",
            issue: "",
          };
        }
        setInputs(newInputs);
      })
      .catch((e) => {
        setError(`載入失敗：${e.message}`);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
  }, [storeId]);

  function updateInput(id: number, field: keyof RecInput, value: string) {
    setInputs((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  }

  async function handleSubmitSupplier(supplierItems: ReceivingItem[]) {
    const toSubmit = supplierItems.filter((i) => !i.isReceived);
    if (toSubmit.length === 0) {
      toast.error("此供應商已全部驗收");
      return;
    }
    // 擋退貨量 > 實收量（會算出負應付）
    const bad = toSubmit.find((i) => {
      const inp = inputs[i.orderItemId];
      if (!inp || inp.result !== "品質問題") return false;
      return (parseFloat(inp.returnedQty) || 0) > (parseFloat(inp.receivedQty) || 0);
    });
    if (bad) {
      toast.error(`「${bad.itemName}」退貨量不能超過實收量`);
      return;
    }
    setSubmitting(true);
    try {
      const records = toSubmit.map((i) => {
        const input = inputs[i.orderItemId] || {
          receivedQty: i.quantity,
          returnedQty: "0",
          result: "正常",
          issue: "",
        };
        // 未到貨 → received/returned 都歸 0；其他狀態用使用者輸入
        const isMissing = input.result === "未到貨";
        return {
          orderItemId: i.orderItemId,
          receivedQty: isMissing ? "0" : (input.receivedQty || i.quantity),
          returnedQty: isMissing ? "0" : (input.returnedQty || "0"),
          result: input.result || "正常",
          issue: input.issue || null,
        };
      });
      const res = await fetch("/api/receiving", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records }),
      });
      if (res.ok) {
        toast.success(`已驗收 ${toSubmit.length} 項`);
        // 已驗收的品項會從「未驗收清單」消失 — 直接把它們從畫面移除
        const doneIds = new Set(toSubmit.map((s) => s.orderItemId));
        setItems((prev) => prev.filter((i) => !doneIds.has(i.orderItemId)));
      } else {
        toast.error("驗收失敗");
      }
    } catch {
      toast.error("驗收失敗");
    } finally {
      setSubmitting(false);
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
      <div className="text-center py-12 space-y-3">
        <AlertTriangleIcon className="size-8 text-orange-500 mx-auto" />
        <p className="text-base text-red-500">{error}</p>
        <Button
          variant="outline"
          onClick={loadData}
          className="h-11 rounded-xl gap-2"
        >
          <Loader2 className="size-4" /> 重新載入
        </Button>
      </div>
    );
  if (items.length === 0)
    return (
      <div className="text-center py-12 text-muted-foreground text-base">
        近期沒有待驗收的品項
      </div>
    );

  // 按「日期｜供應商」分組 — 拆單後同一天可能多家、隔天到貨也各自一組
  const byGroup = new Map<string, ReceivingItem[]>();
  for (const item of items) {
    const key = `${item.orderDate}｜${item.supplierName}`;
    const list = byGroup.get(key) || [];
    list.push(item);
    byGroup.set(key, list);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-base font-semibold bg-muted text-muted-foreground">
        <AlertTriangle className="size-5" />
        {`還有 ${items.length} 項待驗收（近 7 天）`}
      </div>

      {Array.from(byGroup.entries()).map(([groupKey, supplierItems]) => {
        const [gDate, gSupplier] = groupKey.split("｜");
        // MM/DD 顯示
        const dateLabel = gDate?.slice(5).replace("-", "/") ?? "";
        return (
          <div
            key={groupKey}
            className="bg-card border border-border rounded-xl overflow-hidden"
          >
            <div className="px-4 py-3 bg-muted/30 flex items-center justify-between">
              <span className="font-semibold text-base">{gSupplier}</span>
              <Badge variant="outline" className="text-xs">{dateLabel} 到貨</Badge>
            </div>
            <div className="divide-y">
              {supplierItems.map((item) => {
                const input = inputs[item.orderItemId];
                const orderedQty = parseFloat(item.quantity);
                return (
                  <div
                    key={item.orderItemId}
                    className={`px-4 py-3 space-y-2 flex gap-3 ${item.isReceived ? "bg-green-50/50" : ""}`}
                  >
                    <div
                      className={`w-1 rounded-full shrink-0 self-stretch ${item.isReceived ? "bg-green-400" : "bg-transparent"}`}
                    />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span
                            className={`text-base font-medium ${item.isReceived ? "line-through text-muted-foreground" : ""}`}
                          >
                            {item.itemName}
                          </span>
                          <span className="text-sm text-muted-foreground ml-2">
                            訂 {orderedQty} {item.unit}
                          </span>
                        </div>
                        {item.isReceived && (
                          <span
                            className={`text-sm font-semibold ${RESULT_COLORS[item.receivedResult || "正常"]}`}
                          >
                            {item.receivedResult || "正常"} ✓
                          </span>
                        )}
                      </div>

                      {!item.isReceived && input && (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            className="w-20 h-11 text-center text-base border border-border rounded-xl bg-transparent"
                            value={input.receivedQty}
                            onChange={(e) =>
                              updateInput(
                                item.orderItemId,
                                "receivedQty",
                                e.target.value
                              )
                            }
                            placeholder={String(orderedQty)}
                          />
                          <span className="text-sm text-muted-foreground shrink-0">
                            {item.unit}
                          </span>

                          <Select
                            value={input.result}
                            onValueChange={(v) =>
                              updateInput(
                                item.orderItemId,
                                "result",
                                v ?? "正常"
                              )
                            }
                          >
                            <SelectTrigger className="flex-1 h-11 text-sm rounded-xl">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {RESULT_OPTIONS.map((opt) => (
                                <SelectItem key={opt} value={opt}>
                                  <span className={RESULT_COLORS[opt]}>
                                    {opt}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* 品質問題 → 顯示退貨數量輸入（part of received_qty 退掉的部分） */}
                      {!item.isReceived &&
                        input &&
                        input.result === "品質問題" && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-red-600 font-medium shrink-0">退貨</span>
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              max={input.receivedQty}
                              className="w-20 h-11 text-center text-base border border-red-300 rounded-xl bg-transparent"
                              value={input.returnedQty}
                              onChange={(e) =>
                                updateInput(
                                  item.orderItemId,
                                  "returnedQty",
                                  e.target.value
                                )
                              }
                              placeholder="0"
                            />
                            <span className="text-sm text-muted-foreground shrink-0">
                              {item.unit}（不付錢、不入庫）
                            </span>
                          </div>
                        )}

                      {!item.isReceived &&
                        input &&
                        input.result !== "正常" && (
                          <input
                            className="w-full h-11 text-base px-3 border border-border rounded-xl bg-transparent"
                            placeholder="異常說明..."
                            value={input.issue}
                            onChange={(e) =>
                              updateInput(
                                item.orderItemId,
                                "issue",
                                e.target.value
                              )
                            }
                          />
                        )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-4 pb-4">
              <Button
                className="w-full h-12 gap-2 text-base rounded-xl"
                onClick={() => handleSubmitSupplier(supplierItems)}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <ClipboardCheck className="size-5" />
                )}
                確認驗收（{gSupplier}）
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

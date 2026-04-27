"use client";

/**
 * 驗收 Tab — 按供應商分組顯示今日待驗收品項
 * 從 order-page-client.tsx 拆分出來
 */
import { useState, useEffect } from "react";
import { formatDateLocal } from '@/lib/format';
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
  CheckCircle2,
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
    const today = formatDateLocal();
    fetch(`/api/orders?date=${today}&limit=1`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(async (ords) => {
        if (ords.length === 0) {
          setItems([]);
          return;
        }
        const ord = ords[0];
        const recRes = await fetch(`/api/receiving?orderId=${ord.id}`);
        if (!recRes.ok) throw new Error(`HTTP ${recRes.status}`);
        const { details, receivings } = await recRes.json();
        const recMap = new Map<number, { result: string }>();
        for (const r of receivings || []) recMap.set(r.orderItemId, r);
        const myItems = (details || [])
          .filter((d: { storeId: number }) => d.storeId === storeId)
          .map(
            (d: {
              orderItemId: number;
              itemName: string;
              quantity: string;
              unit: string;
              supplierName: string;
            }) => {
              const rec = recMap.get(d.orderItemId);
              return {
                orderItemId: d.orderItemId,
                itemName: d.itemName,
                quantity: d.quantity,
                unit: d.unit,
                supplierName: d.supplierName,
                isReceived: !!rec,
                receivedResult: rec?.result,
              };
            }
          );
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
        setItems((prev) =>
          prev.map((i) => {
            const submitted = toSubmit.find(
              (s) => s.orderItemId === i.orderItemId
            );
            if (submitted)
              return {
                ...i,
                isReceived: true,
                receivedResult: inputs[i.orderItemId]?.result || "正常",
              };
            return i;
          })
        );
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
        今天沒有待驗收的品項
      </div>
    );

  const bySupplier = new Map<string, ReceivingItem[]>();
  for (const item of items) {
    const list = bySupplier.get(item.supplierName) || [];
    list.push(item);
    bySupplier.set(item.supplierName, list);
  }

  const allDone = items.every((i) => i.isReceived);
  const receivedCount = items.filter((i) => i.isReceived).length;

  return (
    <div className="space-y-3">
      <div
        className={`flex items-center gap-2 px-4 py-3 rounded-xl text-base font-semibold ${
          allDone
            ? "bg-green-50 text-green-700"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {allDone ? (
          <CheckCircle2 className="size-5" />
        ) : (
          <AlertTriangle className="size-5" />
        )}
        {allDone
          ? "全部驗收完成！"
          : `驗收進度：${receivedCount} / ${items.length} 項`}
      </div>

      {Array.from(bySupplier.entries()).map(([supplier, supplierItems]) => {
        const supplierDone = supplierItems.every((i) => i.isReceived);
        return (
          <div
            key={supplier}
            className={`bg-card border rounded-xl overflow-hidden ${supplierDone ? "border-green-200" : "border-border"}`}
          >
            <div className="px-4 py-3 bg-muted/30 flex items-center justify-between">
              <span className="font-semibold text-base">{supplier}</span>
              {supplierDone && (
                <Badge className="bg-green-100 text-green-700 text-xs">
                  已驗收
                </Badge>
              )}
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

            {!supplierDone && (
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
                  確認驗收（{supplier}）
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * LINE 通知模組 — 叫貨系統事件推播
 *
 * 使用 LINE Messaging API 推播到指定群組
 *
 * 環境變數：
 *   LINE_CHANNEL_TOKEN  — LINE Bot Channel Access Token
 *   LINE_GROUP_ID       — 推播目標群組 ID
 *
 * 如果環境變數未設定，推播會靜默跳過（不阻擋業務流程）
 */
import { createLogger } from "./logger";

const log = createLogger("line-notify");

const LINE_API = "https://api.line.me/v2/bot/message/push";

/** 取得 LINE 設定，未設定時回傳 null */
function getLineConfig() {
  const token = process.env.LINE_CHANNEL_TOKEN;
  const groupId = process.env.LINE_GROUP_ID;
  if (!token || !groupId) return null;
  return { token, groupId };
}

/** 推播文字訊息到群組 */
async function pushText(text: string): Promise<boolean> {
  const config = getLineConfig();
  if (!config) {
    log.debug("LINE 未設定，跳過推播");
    return false;
  }

  try {
    const res = await fetch(LINE_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({
        to: config.groupId,
        messages: [{ type: "text", text }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      log.error({ status: res.status, err }, "LINE 推播失敗");
      return false;
    }
    return true;
  } catch (err) {
    log.error({ err }, "LINE 推播異常");
    return false;
  }
}

// ── 業務通知模板 ──

/** 叫貨單送出通知 */
export async function notifyOrderSubmitted(params: {
  userName: string;
  storeName: string;
  itemCount: number;
  totalAmount: number;
  orderDate: string;
}): Promise<void> {
  const text = [
    `📦 叫貨單已送出`,
    `門市：${params.storeName}`,
    `送出人：${params.userName}`,
    `品項數：${params.itemCount}`,
    `金額：$${params.totalAmount.toLocaleString()}`,
    `日期：${params.orderDate}`,
  ].join("\n");
  await pushText(text);
}

/** 叫貨單產生通知（PO 拆單完成） */
export async function notifyPOGenerated(params: {
  date: string;
  supplierCount: number;
  poNumbers: string[];
}): Promise<void> {
  const text = [
    `📋 叫貨單已產生`,
    `日期：${params.date}`,
    `供應商數：${params.supplierCount}`,
    `單號：${params.poNumbers.join(", ")}`,
  ].join("\n");
  await pushText(text);
}

/** 庫存不足警示 */
export async function notifyLowStock(params: {
  items: Array<{ name: string; currentStock: number; safetyStock: number; unit: string }>;
}): Promise<void> {
  if (params.items.length === 0) return;
  const lines = params.items.slice(0, 10).map(
    (i) => `  • ${i.name}：${i.currentStock} ${i.unit}（安全庫存 ${i.safetyStock}）`
  );
  const text = [
    `⚠️ 庫存不足警示（${params.items.length} 項）`,
    ...lines,
    params.items.length > 10 ? `  ...及其他 ${params.items.length - 10} 項` : "",
  ].filter(Boolean).join("\n");
  await pushText(text);
}

/** 驗收完成通知 */
export async function notifyReceivingDone(params: {
  userName: string;
  storeName: string;
  supplierName: string;
  itemCount: number;
  issues: number;
}): Promise<void> {
  const status = params.issues > 0 ? `⚠️ ${params.issues} 項異常` : "✅ 全部正常";
  const text = [
    `📥 驗收完成`,
    `門市：${params.storeName}`,
    `供應商：${params.supplierName}`,
    `驗收人：${params.userName}`,
    `品項數：${params.itemCount}`,
    `結果：${status}`,
  ].join("\n");
  await pushText(text);
}

/** 調撥完成通知 */
export async function notifyTransferDone(params: {
  transferNumber: string;
  type: "transfer" | "borrow";
  fromStore: string;
  toStore: string;
  itemCount: number;
}): Promise<void> {
  const label = params.type === "borrow" ? "借料" : "調撥";
  const text = [
    `🔄 ${label}完成`,
    `單號：${params.transferNumber}`,
    `${params.fromStore} → ${params.toStore}`,
    `品項數：${params.itemCount}`,
  ].join("\n");
  await pushText(text);
}

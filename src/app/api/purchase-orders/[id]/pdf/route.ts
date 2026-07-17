/**
 * 叫貨單 PDF API
 * GET /api/purchase-orders/[id]/pdf — 伺服器端把叫貨單版式渲染成 PDF 下載
 *
 * 架構同 Costflows 的 proxy-pdf：headless Chrome 渲染共用 HTML 模板（lib/po-template.ts），
 * 版式與前端「列印」完全一致；給供應商 — 無價格。
 *
 * CRITICAL: serverless 的 Chromium 沒有中文字型，必須先用 chromium.font() 載入
 * public/fonts/NotoSansTC.ttf（從本站 URL 抓），否則中文全變豆腐字。
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  purchaseOrders,
  purchaseOrderItems,
  items,
  stores,
  suppliers,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireBuyerOrAbove } from "@/lib/api-auth";
import { parseIntSafe } from "@/lib/parse-int-safe";
import { buildPoHtml, type PoTemplateItem } from "@/lib/po-template";

/** Chromium 冷啟動 + 字型下載 + 渲染需要時間，放寬到 Hobby 上限 */
export const maxDuration = 60;

/** 本地開發用的系統 Chrome 路徑（macOS） */
const LOCAL_CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

/**
 * serverless 環境：把中文字型放進 chromium 的 fontconfig 目錄（/tmp/fonts）。
 * @sparticuz/chromium v149 已移除 font() API；executablePath() 會把內建字型
 * 解壓到 FONTCONFIG_PATH（/tmp/fonts），把自己的 .ttf 丟進同一目錄即可被掃到。
 */
async function ensureChineseFont(fontUrl: string): Promise<void> {
  const { existsSync } = await import("fs");
  const { mkdir, writeFile } = await import("fs/promises");
  const fontDir = process.env.FONTCONFIG_PATH || "/tmp/fonts";
  const dest = `${fontDir}/NotoSansTC.ttf`;
  if (existsSync(dest)) return; // warm lambda 已下載過
  await mkdir(fontDir, { recursive: true });
  const res = await fetch(fontUrl);
  if (!res.ok) throw new Error(`字型下載失敗: ${res.status}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

async function renderPdf(html: string, fontUrl: string): Promise<Uint8Array> {
  const puppeteer = await import("puppeteer-core");

  const isServerless = !!process.env.VERCEL;
  let executablePath: string;
  let args: string[] = [];

  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    executablePath = await chromium.executablePath(); // 這步會設好 FONTCONFIG_PATH
    await ensureChineseFont(fontUrl);
    args = chromium.args;
  } else {
    const { existsSync } = await import("fs");
    const found = LOCAL_CHROME_PATHS.find((p) => existsSync(p));
    if (!found) throw new Error("找不到本機 Chrome，無法產生 PDF");
    executablePath = found; // 本機 Chrome 有系統中文字型，不需另載
  }

  const browser = await puppeteer.launch({
    executablePath,
    args,
    headless: true,
  });
  try {
    const page = await browser.newPage();
    // 模板為自包含 HTML（無外部資源），load 即完成
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "a4",
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBuyerOrAbove(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const poId = parseIntSafe(id);
  if (poId === null) {
    return NextResponse.json({ error: "無效的叫貨單 ID" }, { status: 400 });
  }

  const [po] = await db
    .select({
      id: purchaseOrders.id,
      supplierName: suppliers.name,
      poNumber: purchaseOrders.poNumber,
      deliveryDate: purchaseOrders.deliveryDate,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(eq(purchaseOrders.id, poId))
    .limit(1);

  if (!po) {
    return NextResponse.json({ error: "叫貨單不存在" }, { status: 404 });
  }

  const rows = await db
    .select({
      itemName: items.name,
      itemUnit: items.unit,
      itemSpec: items.spec,
      storeName: stores.name,
      quantity: purchaseOrderItems.quantity,
      unit: purchaseOrderItems.unit,
      notes: purchaseOrderItems.notes,
    })
    .from(purchaseOrderItems)
    .innerJoin(items, eq(purchaseOrderItems.itemId, items.id))
    .innerJoin(stores, eq(purchaseOrderItems.storeId, stores.id))
    .where(eq(purchaseOrderItems.poId, poId))
    .orderBy(items.name, stores.name);

  const templateItems: PoTemplateItem[] = rows.map((r) => ({
    itemName: r.itemName,
    unit: r.unit || r.itemUnit,
    storeName: r.storeName,
    quantity: parseFloat(r.quantity) || 0,
    // 與文字匯出同規則：明細備註優先，退回品項規格
    notes: r.notes || r.itemSpec,
  }));

  const html = buildPoHtml(
    {
      poNumber: po.poNumber,
      supplierName: po.supplierName,
      deliveryDate: po.deliveryDate,
      items: templateItems,
    },
    {
      autoPrint: false,
      printedAt: new Date().toLocaleString("zh-TW", {
        hour12: false,
        timeZone: "Asia/Taipei",
      }),
    }
  );

  try {
    const fontUrl = `${request.nextUrl.origin}/fonts/NotoSansTC.ttf`;
    const pdf = await renderPdf(html, fontUrl);

    // 檔名：ASCII fallback 用單號；完整檔名（含中文供應商名）走 RFC 5987
    const asciiName = `${po.poNumber}.pdf`;
    const utf8Name = encodeURIComponent(`${po.poNumber}_${po.supplierName}.pdf`);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[po-pdf] 產生 PDF 失敗:", err);
    return NextResponse.json({ error: "產生 PDF 失敗，請改用列印功能" }, { status: 500 });
  }
}

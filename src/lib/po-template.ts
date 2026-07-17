/**
 * 叫貨單 HTML 模板 — 前端列印（printPO）與後端 PDF（/api/purchase-orders/[id]/pdf）共用
 *
 * CRITICAL: 版式改這裡一份就好，列印和 PDF 永遠一致。
 * 給供應商的文件 — 一律無價格。
 */

export interface PoTemplateItem {
  itemName: string;
  /** 顯示單位（訂購單位優先，退回品項單位） */
  unit: string;
  storeName: string;
  quantity: number;
  notes: string | null;
}

export interface PoTemplateData {
  poNumber: string;
  supplierName: string;
  /** YYYY-MM-DD */
  deliveryDate: string;
  items: PoTemplateItem[];
}

/** HTML escape（品名/備註來自 DB，防注入保險） */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 'YYYY-MM-DD' → 'YYYY/MM/DD（週X）' */
function formatDeliveryDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}/${m}/${day}（週${weekdays[d.getDay()]}）`;
}

/** 按品項彙總各店數量（同品項多店 → 一列多店欄） */
function groupItems(items: PoTemplateItem[]) {
  const storeNames = [...new Set(items.map((i) => i.storeName))].sort();
  const map = new Map<
    string,
    { itemName: string; unit: string; notes: string | null; stores: Record<string, number>; total: number }
  >();
  for (const it of items) {
    if (!map.has(it.itemName)) {
      map.set(it.itemName, { itemName: it.itemName, unit: it.unit, notes: it.notes, stores: {}, total: 0 });
    }
    const e = map.get(it.itemName)!;
    e.stores[it.storeName] = (e.stores[it.storeName] || 0) + it.quantity;
    e.total += it.quantity;
  }
  return { storeNames, grouped: [...map.values()] };
}

export interface BuildPoHtmlOptions {
  /** 列印模式：載入後自動開列印對話框（前端 window.open 用；PDF 產生不要開） */
  autoPrint?: boolean;
  /** 產生時間字串（顯示於頁尾）；不傳則由呼叫端環境現算 */
  printedAt?: string;
}

export function buildPoHtml(data: PoTemplateData, options: BuildPoHtmlOptions = {}): string {
  const { storeNames, grouped } = groupItems(data.items);
  const hasNotes = grouped.some((g) => g.notes);
  const deliveryDisplay = formatDeliveryDisplay(data.deliveryDate);
  const printedAt = options.printedAt ?? new Date().toLocaleString('zh-TW', { hour12: false });

  const storeHeaders = storeNames.map((s) => `<th class="c">${esc(s)}</th>`).join('');
  const rows = grouped
    .map((g, idx) => {
      const storeCells = storeNames
        .map((s) => `<td class="c">${g.stores[s] || ''}</td>`)
        .join('');
      return `<tr>
      <td class="c muted">${idx + 1}</td>
      <td class="name">${esc(g.itemName)}</td>
      ${storeCells}
      <td class="c total">${g.total}</td>
      <td class="c">${esc(g.unit)}</td>
      ${hasNotes ? `<td class="notes">${esc(g.notes || '')}</td>` : ''}
    </tr>`;
    })
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(data.poNumber)} - ${esc(data.supplierName)}</title>
    <style>
      *{box-sizing:border-box}
      body{font-family:"Noto Sans TC","PingFang TC",sans-serif;padding:28px;max-width:820px;margin:0 auto;color:#1a1a1a}
      .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #b91c1c;padding-bottom:14px}
      .brand{font-size:22px;font-weight:800;letter-spacing:1px}
      .brand small{display:block;font-size:12px;color:#888;font-weight:400;letter-spacing:2px;margin-top:2px}
      .doc{text-align:right}
      .doc .t{font-size:18px;font-weight:700}
      .doc .no{font-size:14px;color:#b91c1c;font-weight:600;margin-top:2px}
      .info{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px 24px;margin:16px 0 4px;font-size:13px}
      .info b{display:block;color:#888;font-weight:500;font-size:11px;margin-bottom:1px}
      table{width:100%;border-collapse:collapse;margin-top:14px;font-size:13px}
      th{background:#f7f7f7;padding:7px 6px;border:1px solid #d9d9d9;font-size:12px;text-align:left}
      td{padding:7px 6px;border:1px solid #d9d9d9;vertical-align:top}
      .c{text-align:center}
      .muted{color:#999;width:34px}
      .name{font-weight:600}
      .total{font-weight:800}
      .notes{font-size:12px;color:#555}
      .sign{display:flex;gap:48px;margin-top:36px;font-size:13px}
      .sign div{flex:1}
      .sign .line{border-bottom:1px solid #999;height:38px;margin-top:6px}
      .foot{margin-top:28px;padding-top:10px;border-top:1px solid #eee;color:#aaa;font-size:11px;display:flex;justify-content:space-between}
      @media print{body{padding:10px}}
    </style></head><body>
    <div class="head">
      <div class="brand">肥龍老火鍋<small>FEI LONG HOTPOT · 採購部</small></div>
      <div class="doc">
        <div class="t">叫貨單 Purchase Order</div>
        <div class="no">${esc(data.poNumber)}</div>
      </div>
    </div>
    <div class="info">
      <div><b>供應商</b>${esc(data.supplierName)}</div>
      <div><b>送貨日期</b>${deliveryDisplay}</div>
      <div><b>品項數</b>${grouped.length} 項</div>
    </div>
    <table><thead><tr>
      <th class="c">#</th><th>品名</th>${storeHeaders}
      <th class="c">合計</th><th class="c">單位</th>
      ${hasNotes ? '<th>備註</th>' : ''}
    </tr></thead><tbody>${rows}</tbody></table>
    <div class="sign">
      <div>供應商出貨確認<div class="line"></div></div>
      <div>門市驗收簽名<div class="line"></div></div>
    </div>
    <div class="foot">
      <span>肥龍老火鍋 採購系統</span>
      <span>${esc(data.poNumber)} · 列印於 ${esc(printedAt)}</span>
    </div>
    ${options.autoPrint ? '<script>window.onload=()=>window.print()</script>' : ''}
    </body></html>`;
}

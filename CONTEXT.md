---
status: active
note: 2026-05-22 補上 ingredient 抽象層討論（食材 vs SKU）與 BOM 資料品質拍板
generated: 2026-05-21
updated: 2026-05-22
---

# 肥龍老火鍋叫貨系統 (dragon-order)

肥龍老火鍋的內部 B2B 訂貨平台。Next.js 16 + Supabase + Vercel，給門市叫貨員、採購、會計使用。多店架構，未來規劃白標 SaaS（Phase D）。

## Language

### 供應商與品項

**SKU**：
單一品項在單一供應商的最小儲存單位。同品項不同供應商必須各自建 SKU，不可合併。
_Avoid_: 貨號、商品編號

**品項 (Item)**：
DB `items` 表的一筆紀錄，等同於一個 SKU。
_Avoid_: 商品、產品

**供應商 (Supplier)**：
上游廠商。每家有獨立 supplier_code（如 VG-01）。
_Avoid_: 廠商、上游

**幕府**：
供應商代碼 VG-01。負責蔬菜、菇類等農產。週報價。
_Avoid_: 蔬菜廠

**綠盛**：
供應商代碼 VG-02。全品項（蔬菜+火鍋料+水發類），跟幕府/韓流完全獨立公司。半月報價。水發類（黑毛肚、白毛肚、鴨腸、花膠、黃喉、鳥蛋）目前只有綠盛供應。
_Avoid_: 大盤

**韓流**：
供應商代碼 HP-01。負責加工冷凍品、滷煮類、豆製品、火鍋料批發裝。**跟幕府是同一間公司**但 DB 視為獨立 supplier。
_Avoid_: 加工廠

### 訂單與價格

**叫貨單 (PO, Purchase Order)**：
正式發給供應商的採購單。DB 表 `purchase_orders`，含 `po_number`、`delivery_date`、價格鎖定。
_Avoid_: 進貨單

**訂單 (Order)**：
員工在叫貨頁送出的訂貨請求，admin 核准後生成 PO。DB 表 `orders`。
_Avoid_: 採購單（採購單專指 PO）

**進貨價 (cost_price)**：
跟供應商買的單價。`numeric(10,2)`。員工/店長角色看不到（隱藏成本）。
_Avoid_: 原價、成本

**門市價 (store_price)**：
集團內部結算用，多店架構下總部給門市的轉移價。
_Avoid_: 批發價、內部價

**售價 (sell_price)**：
最終賣給客人的價格（菜單上的）。
_Avoid_: 零售價

**雙層定價**：
依使用者 RBAC 角色決定看到 cost_price 或 store_price。
_Avoid_: 階層定價（會跟會員系統的「階層」混淆）

**排程改價 (scheduled price change)**：
預約未來生效日才套用的價格變動。DB 表 `scheduled_price_changes`，GitHub Actions cron 每天台北 05:00 套用。
_Avoid_: 預改、未來改價

**報價單**：
供應商提供的 Excel 價格表。透過 `scripts/preview-price-schedule.ts` 比對 DB 後產出排程改價計畫檔到 `scripts/plans/`。

### 庫存與門市

**庫存異動**：
進貨(+)、出貨(-)、盤點(=)三種。
_Avoid_: 異動單

**調撥 (Transfer)**：
門市之間的庫存移轉，分借出/歸還/沖銷三動作。不經過供應商。DB 表 `transfers`。
_Avoid_: 轉貨、調貨

**借料**：
**未歸還狀態**的調撥（借出 → 還沒對應的歸還/沖銷）。沖銷後不算借料。
_Avoid_: 借貨

**多店**：
一套系統服務 ≥ 2 間分店。所有 transactional 表都有 `store_id`。
_Avoid_: 連鎖、分公司

**區域倉庫**：
`stores.type = 'warehouse'` 的特殊「店」，集中收貨後再撥往各門市。
_Avoid_: 中央倉、總倉

**驗收**：
供應商送貨到門市後的入庫流程，含批次數量檢核、發票對齊。API 包 transaction。
_Avoid_: 收貨、入庫

### BOM 與報表

**BOM (Bill of Materials)**：
菜單品項到原料品項的對應，一道菜由多個 ingredient/item 組成。
**目前 schema**：`bom_items` 綁 `menu_item_id` + `item_id` (SKU) + `ingredient_name` (free text)。
**規劃**：BOM 改綁 `ingredient_id`，菜品成本依 ingredient 主供應商當前單價自動算（2026-05-22 設計拍板，尚未實作）。
_Avoid_: 配方、食譜

**食材 (Ingredient)**：
SKU 上層的抽象——一個食材可能有多家供應商賣（各家算獨立 SKU），都歸到同一個 ingredient。
- 凍豆腐底下：瑞濱 1kg ($95) / 韓流 3kg 批發 ($262) / 綠盛 3kg ($220) → **1 個** ingredient
- 真露「原味/草莓/葡萄柚」5 口味：菜單獨立計價 → **5 個** ingredient（不依進貨拆，依菜單拆）
- 切法（蔥段 vs 蔥花、薑片 vs 老薑）**不分 ingredient**，記在 BOM `notes`/`quantity`
- 雜貨/酒水/耗材**不進** ingredient 體系，直接用 items
**狀態**：ingredients 表尚未建立（2026-05-22 收斂提案完成，預估 150 筆，等實作）。
_Avoid_: 品項（品項=SKU）、原料分類（分類是 category）

**消耗報表**：
依 BOM 推算各 item 理論消耗量，跟實際出庫對比。
_Avoid_: 用量報表

**自動叫貨建議**：
依消耗速度 + 安全庫存推算的補貨建議。**非 AI 預測**（AI 預測是 Phase E5，尚未做）。
_Avoid_: 補貨建議、AI 預測

**集團報表**：
跨多店彙總的報表。
_Avoid_: 總部報表

### 角色與權限

**admin**：
最高權限，看得到 cost_price 與全資料。

**buyer**：
採購角色，可建/改/取消叫貨單，看得到 cost_price。
_Avoid_: 採購員

**viewer**：
唯讀角色。

**getStoreScope()**：
`permissions.ts` 的核心函式，決定使用者能看到哪些 `store_id` 的資料。

## Flagged ambiguities

- **「叫貨」vs「採購」**：對使用者用「叫貨」（手機 UI 顯示）；DB 與內部用 `purchase_*`（schema 名）。**保留兩套詞彙**——對外友善、對內精確。
- **「Order」vs「PO」**：員工送出的是 Order（叫貨頁的請求），admin 核准後生成 PO（給供應商的正式採購單）。兩個是不同 DB 表，前者可改/退回，後者發出後要對帳。
- **「借料」vs「調撥」**：借料是調撥的一個**狀態**（未歸還），不是另一種獨立操作。
- **HP- prefix ≠ 屬於韓流**：DB 綠盛底下有 13 個 HP- 開頭的火鍋料 SKU（#241~#253），是綠盛真的賣的。判斷供應商歸屬只看 `supplier_id`，不看品項前綴。
- **同品項不同供應商**：必須各自建獨立 SKU，**不能合併**。連幕府跟韓流（同公司）的同品項也要分開。比價系統靠這個運作。
- **「品項 (SKU)」vs「食材 (Ingredient)」**：品項 = items 表的 SKU（綁供應商）；食材 = ingredients 表的抽象（1:N items）。比價/採購/庫存看 SKU，BOM/菜品成本看 ingredient。**SKU 各自獨立不變，ingredient 是上面新加的抽象層，兩者並存不衝突**。
- **ingredient 劃分原則**：以「**菜單上是否獨立計價**」為主，**不是純進貨食材**。同食材多家供應商 → 1 ingredient（進貨合併）；同食材多口味在菜單獨立賣 → 多 ingredient（銷售拆分）。
- **BOM.ingredient_name vs BOM.item_id 可能不一致**：過去匯入失誤造成。2026-05-22 抓到鍋底 BOM 30 筆錯指（乾小椒→餐巾紙、米酒→黑胡椒粉、酒釀→太白粉等），已修。用 `scripts/scan-bom-mismatch.ts` 可定期重掃。長期解法是 BOM 改綁 `ingredient_id` 而非 `item_id`。
- **BOM `quantity` 是 varchar**：值像「120g」「2~3個」「1碗」「1大匙」混雜，導致 `menu_items.cost_per_serving` 大半算不出來放 0。要做 cost_per_serving 自動計算必須先拆 `quantity_value` (numeric) + `quantity_unit` (text)。

## Example dialogue

採購主管 A 跟新進員工 B：

> **A**：「明天綠盛報價單要進來，記得跑 preview script。重點看『將改價』裡有沒有漲幅超過 50% 的——**那不是真改價，是規格不同的新 SKU**。」
>
> **B**：「那如果同一個品項，幕府跟綠盛都有報價，要合成一個 SKU 嗎？」
>
> **A**：「不行。**SKU 必須跟供應商綁定**，這樣比價才能正常運作。每家的成本、規格、單位都可能不同。」
>
> **B**：「庫存呢？同品項兩家供應商，怎麼算？」
>
> **A**：「庫存是按 `item_id` 算，每個 SKU 是獨立 `item_id`，所以 DB 看是兩筆庫存。**消耗報表跟 BOM 是依菜單品項往下查，可以正確聚合**。」
>
> **B**：「之前那次訂單 cost_price 寫成 0 是什麼狀況？」
>
> **A**：「員工/店長角色在叫貨頁看不到 cost_price（隱藏成本），前端傳 0 過來。新版 POST /api/orders 收件後用 `item_id` 回查 DB 的 cost_price，**不信任前端傳的 unitPrice**。」

# 肥龍叫貨系統 (dragon-order)

## 專案概述
肥龍老火鍋的 Web 採購系統，員工透過手機叫貨，後台管理訂單/供應商/品項/統計。

## 技術架構
| 層 | 技術 |
|---|---|
| 前端 | Next.js 16 (App Router) + Tailwind + shadcn/ui |
| 資料庫 | Neon PostgreSQL + Drizzle ORM |
| 認證 | 員工編號 + 密碼（bcrypt hash + cookie session） |
| 部署 | Vercel |

## 模組地圖（按功能找檔案）

### 🔐 認證 & 權限系統
| 檔案 | 用途 |
|---|---|
| `src/lib/permissions.ts` | 角色定義（admin/buyer/manager/staff）、頁面清單、權限檢查函數 |
| `src/app/actions/auth.ts` | 登入/登出 Server Action（員工編號 + 密碼） |
| `src/middleware.ts` | 路由保護 + 頁面級權限（讀 session cookie） |
| `src/lib/api-auth.ts` | API 三軌認證（Cookie / 系統 Key / 個人 Token） |
| `src/components/login-form.tsx` | 登入表單 UI |
| `src/app/api/me/route.ts` | GET /api/me — 回傳 session（供 client component 用） |
| `src/app/api/logout/route.ts` | POST /api/logout — 清除 cookie |
| `src/app/api/permissions/route.ts` | GET/PUT 角色權限 CRUD |

### 📱 叫貨頁
| 檔案 | 用途 |
|---|---|
| `src/app/order/page.tsx` | 叫貨主頁（Server Component，角色決定價格顯示） |
| `src/components/order/` | 叫貨頁子元件（購物車、品項卡片等） |
| `src/lib/cart.ts` | 購物車邏輯 |

### 📊 後台 Dashboard
| 檔案 | 用途 |
|---|---|
| `src/app/dashboard/layout.tsx` | 動態 sidebar（根據權限過濾導航項目） |
| `src/app/dashboard/page.tsx` | 儀表板（統計卡片 + 圖表） |
| `src/app/dashboard/orders/page.tsx` | 訂單管理 |
| `src/app/dashboard/suppliers/page.tsx` | 供應商管理（卡片列表） |
| `src/app/dashboard/suppliers/[id]/page.tsx` | 供應商品項詳情（品項列表 + 編輯/刪除 + 上傳報價單） |
| `src/app/dashboard/menu/page.tsx` | 品項管理 |
| `src/app/dashboard/bom/page.tsx` | BOM 配方管理 |
| `src/app/dashboard/payments/page.tsx` | 帳務管理 |
| `src/app/dashboard/purchase-orders/page.tsx` | 供應商叫貨單（各店訂單→按供應商拆單→匯出無價格版） |
| `src/app/dashboard/import/page.tsx` | POS 匯入 |

### ⚙️ 設定頁（已拆分）
| 檔案 | 用途 | 行數 |
|---|---|---|
| `settings/page.tsx` | 組合入口（只做組裝） | ~70 |
| `settings/_components/types.ts` | 型別定義 + 常數（角色、頁面） | ~70 |
| `settings/_components/use-settings-data.ts` | 資料載入 Hook | ~65 |
| `settings/_components/user-section.tsx` | 員工列表 UI（桌面表格 + 手機卡片） | ~200 |
| `settings/_components/user-dialogs.tsx` | 新增/編輯/重設密碼/Token Dialog | ~330 |
| `settings/_components/store-section.tsx` | 門市管理 UI + Dialog | ~170 |
| `settings/_components/role-permissions.tsx` | 角色權限管理（checkbox 矩陣） | ~120 |

### 🗄️ 資料庫
| 檔案 | 用途 |
|---|---|
| `src/lib/db/schema.ts` | 🚫 Drizzle schema（12 張表：stores, suppliers, items, users, orders, order_items, receiving, role_permissions, purchase_orders, purchase_order_items, menu_items, bom_items） |
| `src/lib/session.ts` | Session HMAC 簽名/驗證（防 cookie 竄改） |
| `src/lib/db/index.ts` | DB 連線 |

### 🔧 腳本
| 檔案 | 用途 |
|---|---|
| `scripts/seed.ts` | 初始資料匯入 |
| `scripts/update-costs.ts` | 從 Excel 更新品項成本（自動找最新日期版本） |
| `scripts/migrate-roles.ts` | 角色系統遷移（owner→admin、補 employeeId） |

## 關鍵設計決策
- 🚫 金額全部用 integer（元），**不可改成 float**，避免浮點誤差
- 🚫 aliases 是 text[]，是文字叫貨匹配的核心，格式不可改
- 門市：林森店、信義安和店（兩間）
- 訂單狀態機：draft → confirmed → ordered → received → closed
- Session 用 HMAC-SHA256 簽名（防竄改），不用 JWT（Edge Runtime 相容）
- 角色系統：admin（管理員）> buyer（採購）> manager（店長）> staff（員工）
- 頁面權限存在 role_permissions 表，管理員可動態調整
- **雙層品項**：menuItems（菜單品項，客人看到的）↔ bomItems ↔ items（採購品項，跟供應商買的）
- **雙層定價**：cost_price（進貨價）→ store_price（店家採購價）→ sell_price（售價）
- **叫貨單**：各店訂單 → 按供應商拆單 → 匯出含各店明細但無價格的版本給供應商
- 供應商備註會帶到叫貨單（如切肉機24cm、品項切法等）

## 供應商分類
| 類型 | 供應商 |
|---|---|
| 底料 | 繼光/大陸、淘寶/天貓 |
| 肉品 | 以曜、美福、品鮮璞、悠西 |
| 市場 | 市場－邱章城（大衛）、市場－潘惠美、市場－佳麟肉舖、市場－李少愷 |
| 蔬菜 | 幕府、綠盛 |
| 海鮮 | 瑞濱海鮮、台灣食研 |
| 火鍋料 | 小ㄚ姨、韓流 |
| 飲料/酒 | 鉊玖、大韓、八條（僅林森急用） |
| 雜貨 | 津鼎 |
| 耗材 | 潔盈 |

## 環境變數
| 變數 | 說明 |
|---|---|
| DATABASE_URL | Neon PostgreSQL 連線字串 |
| JWT_SECRET | Session 簽名密鑰 |

## 常用指令
```bash
npm run dev              # 開發伺服器
npm run build            # 建置
npx drizzle-kit push     # 推送 schema 到 DB
npx tsx scripts/seed.ts  # 匯入初始資料
npx vercel --prod        # 部署到 Vercel
```

## 測試帳號
| 角色 | 員工編號 | 密碼 |
|---|---|---|
| 管理員（張銘瑋） | E001 | 1234 |

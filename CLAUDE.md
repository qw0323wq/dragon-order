# 肥龍叫貨系統 (dragon-order)

## 專案概述
肥龍老火鍋的 Web 採購系統，員工透過手機叫貨，老闆後台管理訂單/供應商/品項/統計。

## 技術架構
| 層 | 技術 |
|---|---|
| 前端 | Next.js 16 (App Router) + Tailwind + shadcn/ui |
| 資料庫 | Neon PostgreSQL + Drizzle ORM |
| 認證 | 手機號 + PIN（bcrypt hash + cookie session） |
| 部署 | Vercel |

## 資料夾結構
```
src/
├── app/
│   ├── page.tsx              # 登入頁
│   ├── actions/auth.ts       # 登入/登出 Server Actions
│   ├── order/page.tsx        # 📱 員工叫貨（手機優先）
│   ├── dashboard/
│   │   ├── page.tsx          # 📊 儀表板（統計卡片+圖表）
│   │   ├── orders/page.tsx   # 📋 訂單管理（彙總/拆單/複製）
│   │   ├── suppliers/page.tsx # 🏪 供應商管理
│   │   ├── menu/page.tsx     # 🍲 品項管理（成本/售價/毛利）
│   │   └── settings/page.tsx # ⚙️ 設定（預留）
│   └── api/                  # API Routes（items/orders/stores/suppliers）
├── components/
│   ├── ui/                   # shadcn/ui 元件
│   ├── login-form.tsx        # 登入表單
│   └── order/                # 叫貨頁元件
├── lib/
│   ├── db/schema.ts          # 🚫 Drizzle schema（7張表的核心定義）
│   ├── db/index.ts           # DB 連線
│   ├── auth.ts               # JWT / bcrypt 工具
│   ├── alias-matcher.ts      # 品項別稱匹配（文字叫貨用）
│   ├── cart.ts               # 購物車邏輯
│   └── text-parser.ts        # 文字叫貨解析器
└── middleware.ts             # 路由保護
```

## 關鍵設計決策
- 🚫 金額全部用 integer（元），**不可改成 float**，避免浮點誤差
- 🚫 aliases 是 text[]，是文字叫貨匹配的核心，格式不可改
- 門市用 stores 表動態管理，加新店只需 INSERT 一筆
- 訂單狀態機：draft → confirmed → ordered → received → closed
- 認證用 cookie session（JSON），不用 JWT（Edge Runtime 相容）

## 資料庫
- **Neon**：dragon-order 專案（ap-southeast-1，新加坡）
- **Schema**：stores, suppliers, items, users, orders, order_items, receiving
- **初始資料**：18 供應商、115 品項、2 門市（由 scripts/seed.ts 匯入）

## 環境變數
| 變數 | 說明 |
|---|---|
| DATABASE_URL | Neon PostgreSQL 連線字串 |
| JWT_SECRET | Session 簽名密鑰 |

## 常用指令
```bash
npm run dev          # 開發伺服器
npm run build        # 建置
npx drizzle-kit push # 推送 schema 到 DB
npx tsx scripts/seed.ts  # 匯入初始資料
```

## 測試帳號
| 角色 | 手機 | PIN |
|---|---|---|
| 老闆 | 0900000001 | 1234 |
| 林森店員工 | 0900000002 | 0000 |
| 信義店員工 | 0900000003 | 0000 |

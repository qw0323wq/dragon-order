# Design System: 肥龍叫貨系統

## 1. Visual Theme & Atmosphere

肥龍叫貨系統是一個餐飲業後台採購工具，主要使用者是廚房員工和店長，操作環境包含廚房（手機）和辦公室（桌面）。視覺設計追求「溫暖專業」——暖白底色搭配龍紅品牌色，營造火鍋店的溫度感，同時保持後台工具的清晰易讀。

整體氛圍是「溫暖的工具」而非「冷酷的科技」。背景用微暖白（帶一點黃色調的白），邊框用暖灰而非冷灰，圓角加大到 12px 讓介面更柔和。這種溫暖感透過 oklch 色彩空間中 hue 50-60（暖色調）的統一使用來實現。

**Key Characteristics:**
- 暖白底色：`oklch(0.99 0.005 60)` — 帶微黃暖調，減少廚房螢幕長時間使用的疲勞
- 龍紅主色：`oklch(0.48 0.215 25.5)` ≈ `#c0392b` — 品牌識別色，對齊 viewport themeColor
- 純白卡片：`oklch(1 0 0)` — 與暖白底色形成微妙層次
- 暖灰邊框：oklch hue 55 — 所有中性色帶暖調
- 大圓角：`0.75rem` (12px) base — 比一般 SaaS 的 8px 更柔和
- 字型：Geist Sans + PingFang TC / Noto Sans TC 繁體中文 fallback
- shadcn/ui 元件庫 + Base UI primitives
- Mobile-first：底部 tab bar（手機）→ 側邊欄（桌面）

## 2. Color Palette & Roles

### Background Surfaces
- **Page Background** (`oklch(0.99 0.005 60)`): 微暖白，主頁面底色。hue 60 帶一點奶油色調。
- **Card Surface** (`oklch(1 0 0)`): 純白，所有卡片和彈窗背景。與底色的微妙差異創造層次。
- **Sidebar** (`oklch(0.97 0.008 50)`): 比主背景稍暖偏深，hue 50 帶一點褐色調。
- **Muted Surface** (`oklch(0.96 0.008 55)`): 暖灰底，用於表頭、標籤背景、disabled 區域。
- **Secondary** (`oklch(0.97 0.005 55)`): 用於次要按鈕背景。
- **Accent** (`oklch(0.93 0.04 52)`): 暖羊皮紙色，品牌溫度。用於 hover 高亮和強調區域。

### Text & Content
- **Primary Text** (`oklch(0.145 0 0)`): 近黑色，主要閱讀文字。
- **Secondary Text** (`oklch(0.205 0 0)`): 次要文字，副標題。
- **Muted Text** (`oklch(0.52 0 0)`): 輔助說明、時間戳記、placeholder。
- **Accent Text** (`oklch(0.32 0.06 40)`): 帶暖調的深色，用於 accent 區域的文字。
- **Primary Foreground** (`oklch(0.985 0 0)`): 近白，用於龍紅背景上的文字。

### Brand & Accent
- **Dragon Red / Primary** (`oklch(0.48 0.215 25.5)` ≈ `#c0392b`): 品牌主色。用於主按鈕、sidebar active、連結、focus ring、chart-1。
- **Ring** (`oklch(0.48 0.215 25.5)`): 與 primary 相同。focus 狀態的外框。

### Status & Feedback
- **Destructive** (`oklch(0.577 0.245 27.325)`): 刪除、錯誤狀態。
- 分類 Badge 顏色使用 Tailwind 色票：
  - 肉品：`bg-red-50 text-red-700`
  - 蔬菜：`bg-yellow-50 text-yellow-700`
  - 豆製品：`bg-green-50 text-green-700`
  - 主食：`bg-blue-50 text-blue-700`
  - 海鮮：`bg-cyan-50 text-cyan-700`
  - 火鍋料：`bg-orange-50 text-orange-700`
  - 飲料/酒：`bg-purple-50 text-purple-700`
  - 底料：`bg-amber-50 text-amber-700`
  - 耗材：`bg-gray-50 text-gray-700`

### Chart Colors
- Chart 1: `oklch(0.48 0.215 25.5)` — 龍紅（主要數據）
- Chart 2: `oklch(0.65 0.15 40)` — 暖橘
- Chart 3-5: 漸深灰色系列

### Border & Divider
- **Border** (`oklch(0.90 0.005 55)`): 暖灰邊框，hue 55。用於卡片邊框、input 邊框、分隔線。
- **Card Ring** (`ring-1 ring-foreground/10`): 卡片使用 ring 而非 border 做微陰影效果。

## 3. Typography Rules

### Font Family
- **Primary**: Geist Sans, fallbacks: `"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", system-ui, sans-serif`
- **Heading**: 與 Primary 相同（Geist Sans）
- **Monospace**: Geist Mono

### Hierarchy

| Role | Size | Weight | Usage |
|------|------|--------|-------|
| Page Title | 22px (text-xl/2xl) | 700 (bold) | 頁面標題，如「本月總覽」 |
| Section Title | 16px (text-base) | 600 (semibold) | 卡片標題，如「熱門品項 TOP 5」 |
| Card Title | 16px (text-base) | 500 (medium) | shadcn Card 元件標題 |
| Body | 14px (text-sm) | 400 (normal) | 一般文字、表格內容 |
| Small / Label | 13px (text-xs) | 500 (medium) | 統計卡片標籤、表頭 |
| Badge | 11px | 600 (semibold) | 分類 badge、狀態 badge |
| Tab Bar Label | 10px | 500 (medium) | 手機底部 tab bar 文字 |

### Principles
- **繁中優先**: 所有 UI 文字使用繁體中文。字型 fallback chain 確保中文字型可用。
- **數字用英文字型**: 金額、數量等數字由 Geist Sans 渲染，視覺更整齊。
- **Weight 克制**: 大部分文字用 400/500，只有標題用 600/700，避免「到處都是粗體」。

## 4. Component Stylings

### Buttons (shadcn/ui + Base UI)

| Variant | Background | Text | Border | Usage |
|---------|-----------|------|--------|-------|
| default (primary) | `bg-primary` (龍紅) | `text-primary-foreground` (白) | transparent | 主要行動：送出訂單、新增 |
| outline | `bg-background` | `text-foreground` | `border-border` | 次要行動：取消、篩選 |
| secondary | `bg-secondary` | `text-secondary-foreground` | transparent | 輔助行動 |
| ghost | transparent | `text-foreground` | none | 工具列、icon 按鈕 |
| destructive | `bg-destructive/10` | `text-destructive` | transparent | 刪除確認 |
| link | transparent | `text-primary` | none | 內文連結 |

**Shared Button Properties:**
- Height: `h-8` (32px) default, `h-6` xs, `h-7` sm, `h-9` lg
- Radius: `rounded-lg` (12px)
- Focus: `focus-visible:ring-3 ring-ring/50` + `border-ring`
- Active: `active:translate-y-px` (微下壓)
- Disabled: `opacity-50 pointer-events-none`
- Icon size: `size-4` (16px) default

### Cards

- Background: `bg-card` (純白)
- Radius: `rounded-xl` (16px) — 比按鈕更圓
- Padding: `py-4`, content `px-4`
- Elevation: `ring-1 ring-foreground/10` — 極淡的環形陰影，不用 box-shadow
- Gap: `gap-4` 內部間距
- Compact variant: `data-size="sm"` → `gap-3 py-3 px-3`

### Tables

- Header: `text-left`, `text-muted-foreground`, `border-b border-border`
- Cell padding: `p-2`
- Row separator: `border-b` (最後一行無 border)
- Hover: `hover:bg-muted/50`
- Selected: `data-state=selected` → `bg-muted`
- 手機隱藏次要欄位: `hidden sm:table-cell`

### Badges

- Height: `h-5`
- Padding: `px-2`
- Radius: `rounded-4xl` (≈ pill shape)
- Font: `text-xs font-medium`
- 各分類用對應的 Tailwind 色票（見 Color Palette）

### Inputs

- Height: `h-8` (32px)
- Radius: `rounded-lg`
- Border: `border-input` (暖灰)
- Padding: `px-2.5`
- Focus: `focus-visible:ring-3 ring-ring/50` + `border-ring`
- Invalid: `aria-invalid:border-destructive`

### Dialogs & Sheets

- Dialog: 居中彈窗，`rounded-lg`，`bg-card`，`shadow-lg`
- Sheet: 側邊/底部滑入面板
  - 手機：從底部滑入（購物車用此模式）
  - 桌面：從右側滑入
- Overlay: 半透明黑色背景

## 5. Layout Principles

### Spacing System (Tailwind 4px base)
- `gap-1` (4px): icon 與文字
- `gap-2` (8px): 元素內部
- `gap-3` (12px): 卡片內部項目
- `gap-4` (16px): 卡片與卡片
- `p-4` (16px): 手機頁面 padding
- `p-6` (24px): 桌面頁面 padding
- `mb-4`~`mb-6`: 區塊間距

### Grid System
- **Stats grid**: `grid-cols-2`（手機）→ `grid-cols-4`（桌面 lg+）
- **Chart area**: `grid-cols-1`（手機）→ `1.5fr 1fr`（桌面）
- **品項卡片**: `grid-cols-2`（手機）→ 隨寬度增加

### Desktop Layout (md+)
- Sidebar: 220-240px 固定寬度
- Main: 剩餘空間，`padding: 24px`
- Top header: 頁面標題 + 操作按鈕

### Mobile Layout (< md)
- 無 sidebar
- Mini header: `h-7`，logo + 頁面標題
- **Bottom tab bar**: 4 個主要入口 + "更多" 按鈕
- "更多" 選單: 底部 sheet，`grid-cols-4`
- Content: `pb-16` 為 tab bar 留空間
- Safe area: `env(safe-area-inset-bottom)` 支援瀏海手機

### Content Zones
- 統計卡片 → 圖表區 → 詳細表格（由上到下，重要性遞減）
- 操作按鈕放右上角（桌面）或 sticky bottom（手機）

## 6. Depth & Elevation

本系統刻意使用**低深度設計**，符合餐飲工具的實用風格：

| Level | Method | Usage |
|-------|--------|-------|
| L0 Flat | 無邊框無陰影 | 頁面底色、背景區域 |
| L1 Subtle | `ring-1 ring-foreground/10` | 卡片、面板（主要層級） |
| L2 Border | `border border-border` | 輸入框、outline 按鈕 |
| L3 Shadow | `shadow-lg` | Dialog、Sheet、Popover（浮動元素） |
| L4 Focus | `ring-3 ring-ring/50` | Focus 狀態的龍紅外框 |

**原則**:
- 不使用 box-shadow 做卡片深度，改用 ring（更銳利、更現代）
- 只有浮動元素（Dialog/Sheet/Popover）使用 shadow
- Focus 狀態用龍紅色 ring，視覺突出但不突兀

## 7. Design Do's and Don'ts

### ✅ Do
- 使用暖色調（hue 50-60）的灰色，不要冷灰
- 所有可點擊元素最小觸控區域 44×44px（廚房手指可能濕滑）
- 金額數字用 `font-semibold` 或 `font-bold` 突出
- 分類 badge 顏色要一致（見 Color Palette 定義）
- 手機頁面底部預留 `pb-16` 或 `pb-28`（有購物車時）給固定元素
- 用 emoji 作為 section icon（📊📦💰），視覺親切、跨平台一致
- 表格排名 top 3 用金🥇銀🥈銅🥉

### ❌ Don't
- 不要使用冷灰（hue 200-240），會破壞暖色調統一
- 不要用小於 12px 的文字（廚房環境光線不一定好）
- 不要用純黑 `#000` 做文字，用 `oklch(0.145 0 0)` 的近黑
- 不要用 box-shadow 做卡片深度，用 ring
- 不要在手機版顯示太多欄位，用 `hidden sm:table-cell` 隱藏次要欄位
- 不要用英文 label（除了開發者設定頁），所有面向使用者的文字用繁中
- 不要改 primary 龍紅色 `#c0392b`（品牌色，viewport themeColor 也對齊此值）
- 不要用 float 存金額（見 CLAUDE.md 約束）

## 8. Responsive Behavior

### Breakpoints (Tailwind default)
| Breakpoint | Width | Layout Change |
|------------|-------|---------------|
| Base (mobile) | < 640px | 單欄、底部 tab bar、cards 2-col |
| `sm` | ≥ 640px | 表格顯示更多欄位 |
| `md` | ≥ 768px | Sidebar 出現、tab bar 消失 |
| `lg` | ≥ 1024px | 統計卡片 4-col、圖表雙欄 |

### Mobile Adaptations
- Stats grid: `2-col` → `4-col` at lg
- 表格次要欄位: `hidden` → `table-cell` at sm/md
- 導航: bottom tab bar → sidebar at md
- Padding: `p-4` → `p-6` at md
- Sheet: 從底部滑入（mobile）→ 從右側（desktop）
- 購物車: fixed bottom sheet，佔螢幕底部

### Touch Targets
- 按鈕最小高度: 32px（h-8），但操作按鈕建議用 36-44px
- Tab bar items: 充分利用寬度，icon + 文字垂直排列
- 品項卡片: 整張卡片可點擊，不只是小按鈕

## 9. Agent Prompt Guide

### Quick Reference
```
Brand Color:     oklch(0.48 0.215 25.5)  ≈ #c0392b (龍紅)
Background:      oklch(0.99 0.005 60)    (微暖白)
Card:            oklch(1 0 0)            (純白)
Border:          oklch(0.90 0.005 55)    (暖灰)
Text Primary:    oklch(0.145 0 0)        (近黑)
Text Muted:      oklch(0.52 0 0)         (中灰)
Radius Base:     0.75rem (12px)
Card Radius:     rounded-xl (16px)
Button Radius:   rounded-lg (12px)
Font:            Geist Sans + PingFang TC / Noto Sans TC
Component Lib:   shadcn/ui (Base UI primitives)
```

### Example Prompts

**建一張統計卡片:**
```
使用 shadcn Card 元件。頂部放一個 36x36 的 icon 區塊（rounded-lg，背景用對應
分類的淡色），下方放數值（text-2xl font-bold）和標籤（text-xs text-muted-foreground）。
```

**建一個品項列表頁:**
```
使用 shadcn Table。表頭 text-muted-foreground text-xs font-medium。
每行顯示品項名稱、分類 badge（pill shape, 分類色）、單位、價格。
手機版隱藏價格欄（hidden sm:table-cell）。
hover 效果用 hover:bg-muted/50。
```

**建一個表單 Dialog:**
```
使用 shadcn Dialog。標題 text-lg font-semibold。
表單欄位用 shadcn Input（h-8 rounded-lg），Label 用 text-sm font-medium text-muted-foreground。
底部兩個按鈕：取消（variant="outline"）、確認（variant="default"，龍紅色）。
```

**建一個手機操作頁:**
```
bg-gray-50 底色。頂部固定 header（h-14，白色背景，品牌 logo + 頁面標題）。
內容區用卡片列表，每張卡片 bg-white rounded-xl p-4。
底部固定操作列（fixed bottom-0，白色背景，shadow-lg），
包含主按鈕（bg-primary text-white rounded-lg h-12 w-full）。
記得加 pb-20 給底部操作列留空間。
```

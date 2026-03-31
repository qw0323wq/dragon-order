# 🔥 肥龍採購系統 — 搬家到 Mac Mini 指南

## 架構總覽（搬家前必讀）

```
你需要搬的：
✅ 程式碼      → GitHub（已在雲端，git clone 即可）
✅ .env.local  → 手動複製（含密鑰，不在 git 裡）
✅ Vercel CLI  → Mac 重新安裝 + 登入

不需要搬的：
☁️ 資料庫      → Neon PostgreSQL（雲端，自動連線）
☁️ Vercel 部署 → 雲端服務，換電腦一樣能部署
☁️ GitHub repo → 雲端，clone 就好
```

---

## Step 1：Mac Mini 環境安裝

打開 Terminal，依序執行：

```bash
# 1. 安裝 Homebrew（Mac 套件管理器）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. 安裝 Node.js（用 nvm 管理版本）
brew install nvm
mkdir ~/.nvm
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
echo '[ -s "$(brew --prefix nvm)/nvm.sh" ] && \. "$(brew --prefix nvm)/nvm.sh"' >> ~/.zshrc
source ~/.zshrc
nvm install 20
nvm use 20

# 3. 安裝 Git（Mac 通常自帶，但確認一下）
git --version || brew install git

# 4. 安裝 Vercel CLI
npm install -g vercel

# 5. 安裝 Claude Code（如果要用）
npm install -g @anthropic-ai/claude-code
```

---

## Step 2：Clone 專案

```bash
# 選一個你要放程式碼的位置
cd ~/Projects  # 或任何你喜歡的位置
git clone https://github.com/qw0323wq/dragon-order.git
cd dragon-order
```

---

## Step 3：設定環境變數

建立 `.env.local` 檔案：

```bash
cat > .env.local << 'EOF'
# 資料庫連線（Neon PostgreSQL）
DATABASE_URL=postgresql://neondb_owner:npg_vUB5uNkt8Omi@ep-wispy-voice-a1tpuna4-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require

# JWT 簽名密鑰
JWT_SECRET=dragon-order-secret-2026

# API 認證金鑰
API_KEY_ADMIN=8b82ff7e19b91ec251736aaf7acf2acc128cef4ffbb44111116c6c3e91403346
API_KEY_USER=9bd41d5c7bd71b3fb125c2214971ed030900e74d926ef62f56b7aa93172b140b
API_KEY=7e643ecc436c584626d8fe8c195545b004bb3234b10115e335bbdb088bc182f1

# 分店採購價加價比例
COST_MARKUP=1.2
EOF
```

---

## Step 4：安裝依賴 + 啟動

```bash
# 安裝 npm 套件
npm install

# 本地啟動開發模式
npm run dev
# → 打開 http://localhost:3000

# 確認 build 正常
npm run build
```

---

## Step 5：連結 Vercel（部署用）

```bash
# 登入 Vercel
vercel login
# → 選擇你的登入方式（GitHub / Email）

# 連結到現有的 Vercel 專案
vercel link
# → 選擇 qw0323wqs-projects / dragon-order

# 部署
vercel --prod
```

---

## Step 6：設定 Claude Code（如果要用）

```bash
# 複製 CLAUDE.md（專案記憶，已在 git 裡，不用額外操作）

# 設定全域規則（從舊電腦複製）
mkdir -p ~/.claude/rules
# 把舊電腦的以下檔案複製過來：
#   ~/.claude/CLAUDE.md
#   ~/.claude/rules/memory-flush.md
#   ~/.claude/rules/skill-triggers.md
#   ~/.claude/projects/ 整個資料夾
```

---

## 完整驗證清單

```
□ node -v              → 應該是 v20.x 或 v22.x
□ npm run dev          → localhost:3000 能打開
□ npm run build        → 無錯誤
□ 登入測試             → 0900000001 / 1234 能登入
□ 叫貨頁               → /order 品項正常顯示
□ BOM 頁               → /dashboard/bom 有 46 道菜
□ vercel --prod        → 部署成功
□ API 測試             → curl localhost:3000/api/bom 有資料
```

---

## 帳號密碼速查

| 服務 | 帳號 | 備註 |
|------|------|------|
| GitHub | qw0323wq | dragon-order repo |
| Vercel | 同 GitHub 登入 | qw0323wqs-projects |
| Neon DB | neondb_owner | 連線字串在 .env.local |
| Telegram Bot | @my_procurement_bot | Token 在 CLAUDE.md |
| Google Sheets | qw0323wq@gmail.com | Apps Script |

---

## 常見問題

### Q: Mac 上 npm install 報錯？
```bash
# 清快取重裝
rm -rf node_modules package-lock.json
npm install
```

### Q: 連不到資料庫？
```bash
# 測試連線
node -e "require('dotenv').config({path:'.env.local'});const{neon}=require('@neondatabase/serverless');neon(process.env.DATABASE_URL).query('SELECT 1').then(()=>console.log('OK')).catch(e=>console.error(e))"
```

### Q: Vercel 部署失敗？
```bash
# 確認環境變數有設定
vercel env ls
# 如果沒有，重新設定
vercel env add DATABASE_URL
vercel env add JWT_SECRET
# ...其他變數
```

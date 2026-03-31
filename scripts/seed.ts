/**
 * Seed Script — 匯入肥龍老火鍋初始資料
 *
 * 執行：npx tsx scripts/seed.ts
 *
 * 資料來源：~/.zeroclaw/workspace/ 下的 .md 檔
 * 匯入順序：stores → suppliers → items → users（老闆帳號）
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { hash } from 'bcryptjs';
import * as schema from '../src/lib/db/schema';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

// ─────────────────────────────────────────────
// 門市資料
// ─────────────────────────────────────────────
const STORES: schema.NewStore[] = [
  {
    name: '林森店',
    address: '臺北市中山區中山北路一段135巷38號2樓',
    hours: '每日 11:30–00:30',
    sortOrder: 1,
  },
  {
    name: '信義安和店',
    address: '臺北市大安區敦化南路二段63巷53弄8號',
    hours: '週一至週四 17:00–00:00，週五至週日 11:30–00:00',
    sortOrder: 2,
  },
];

// ─────────────────────────────────────────────
// 供應商資料（18 家）
// ─────────────────────────────────────────────
const SUPPLIERS: schema.NewSupplier[] = [
  { name: '繼光/大陸', category: '底料', notes: '大陸進口，匯率 1:5，含跨境運費', leadDays: 14, noDeliveryDays: [] },
  { name: '美福', category: '肉品', notes: '高階肉品', leadDays: 1, noDeliveryDays: [] },
  { name: '以曜', category: '肉品', notes: '主力肉品供應商，品項最全', leadDays: 1, noDeliveryDays: [] },
  { name: '瑞濱海鮮', category: '海鮮', notes: '海鮮+部分火鍋料', leadDays: 1, noDeliveryDays: [0] },
  { name: '幕府', category: '蔬菜', notes: '主力蔬菜+菇類', leadDays: 1, noDeliveryDays: [] },
  { name: '韓流', category: '火鍋料', notes: '豆製品+火鍋料，品項最多', leadDays: 1, noDeliveryDays: [] },
  { name: '綠盛', category: '蔬菜', notes: '日本山藥、雞腿肉', leadDays: 1, noDeliveryDays: [] },
  { name: '小ㄚ姨', category: '火鍋料', notes: '手工火鍋料（蛋餃、川丸子）', leadDays: 1, noDeliveryDays: [] },
  { name: '台灣食研', category: '海鮮', notes: '牡蠣、雞滑', leadDays: 1, noDeliveryDays: [] },
  { name: '品鮮璞', category: '肉品', notes: '究好豬-嫩豬肩', leadDays: 1, noDeliveryDays: [] },
  { name: '悠西', category: '肉品', notes: '午餐肉', leadDays: 1, noDeliveryDays: [] },
  { name: '津鼎', category: '雜貨', notes: '調味料/主食/雜貨', leadDays: 1, noDeliveryDays: [] },
  { name: '鉊玖', category: '飲料', notes: '主力飲料+酒類', leadDays: 1, noDeliveryDays: [] },
  { name: '大韓', category: '酒類', notes: '真露-原味（比鉊玖便宜）', leadDays: 1, noDeliveryDays: [] },
  { name: '八條', category: '酒類', notes: '18天啤酒備選', leadDays: 1, noDeliveryDays: [] },
  { name: '潔盈', category: '耗材', notes: '清潔/耗材', leadDays: 1, noDeliveryDays: [] },
  { name: '市場直購', category: '內臟', notes: '特色/內臟，每日或每2日', leadDays: 0, noDeliveryDays: [] },
  { name: '淘寶/天貓', category: '底料', notes: '進口特色食材，匯率 1:5，需計運費', leadDays: 14, noDeliveryDays: [] },
];

// ─────────────────────────────────────────────
// 品項資料（從 MENU.md + COSTS.md 整理）
// supplier 用名稱對照，seed 時轉成 ID
// ─────────────────────────────────────────────
interface SeedItem {
  name: string;
  category: string;
  unit: string;
  supplier: string; // 供應商名稱，seed 時對照 ID
  costPrice: number; // 進貨價（元）
  sellPrice: number; // 售價（元）
  spec?: string;
  aliases: string[];
}

const ITEMS: SeedItem[] = [
  // ── 鍋底（繼光/大陸）──
  { name: '牛油麻辣鍋(全紅)', category: '底料', unit: '份', supplier: '繼光/大陸', costPrice: 214, sellPrice: 650, aliases: ['全紅','麻辣鍋'] },
  { name: '鴛鴦(麻辣+菌菇)', category: '底料', unit: '份', supplier: '繼光/大陸', costPrice: 180, sellPrice: 580, aliases: ['鴛鴦菌菇'] },
  { name: '鴛鴦(麻辣+番茄)', category: '底料', unit: '份', supplier: '繼光/大陸', costPrice: 175, sellPrice: 580, aliases: ['鴛鴦番茄'] },
  { name: '鴛鴦(番茄+菌菇)', category: '底料', unit: '份', supplier: '繼光/大陸', costPrice: 141, sellPrice: 550, aliases: ['番茄菌菇'] },

  // ── 肉品（以曜為主）──
  { name: '牛五花', category: '肉品', unit: '份', supplier: '以曜', costPrice: 26, sellPrice: 180, spec: '120g/份', aliases: ['牛五花'] },
  { name: 'CH霜降牛', category: '肉品', unit: '份', supplier: '以曜', costPrice: 44, sellPrice: 220, spec: '120g/份', aliases: ['霜降','霜降牛','CH霜降'] },
  { name: 'CH板腱牛', category: '肉品', unit: '份', supplier: '以曜', costPrice: 46, sellPrice: 220, spec: '120g/份', aliases: ['板腱','板腱牛'] },
  { name: '無骨牛小排', category: '肉品', unit: '份', supplier: '美福', costPrice: 134, sellPrice: 480, spec: '120g/份', aliases: ['牛小排','小排'] },
  { name: '牛胸口油', category: '肉品', unit: '份', supplier: '美福', costPrice: 46, sellPrice: 260, spec: '120g/份', aliases: ['胸口油','前胸'] },
  { name: '紐澳重組牛舌', category: '肉品', unit: '份', supplier: '以曜', costPrice: 64, sellPrice: 380, spec: '110g/份', aliases: ['牛舌'] },
  { name: '鹿兒島和牛', category: '肉品', unit: '份', supplier: '美福', costPrice: 144, sellPrice: 780, spec: '120g/份', aliases: ['鹿兒島','鹿兒島和牛'] },
  { name: '北海道和牛', category: '肉品', unit: '份', supplier: '美福', costPrice: 174, sellPrice: 780, spec: '120g/份', aliases: ['北海道','北海道和牛'] },
  { name: '日本A5三叉', category: '肉品', unit: '份', supplier: '以曜', costPrice: 144, sellPrice: 499, spec: '120g/份', aliases: ['A5','三叉','A5三叉'] },
  { name: '吊龍', category: '肉品', unit: '份', supplier: '以曜', costPrice: 140, sellPrice: 420, spec: '120g/份', aliases: ['吊龍'] },
  { name: '松阪豬', category: '肉品', unit: '份', supplier: '以曜', costPrice: 59, sellPrice: 380, spec: '120g/份', aliases: ['松阪','松阪豬'] },
  { name: '台灣豬五花', category: '肉品', unit: '份', supplier: '以曜', costPrice: 34, sellPrice: 180, spec: '120g/份', aliases: ['五花','豬五花','三層肉','台灣豬五花'] },
  { name: '西班牙豬五花', category: '肉品', unit: '份', supplier: '以曜', costPrice: 25, sellPrice: 180, spec: '120g/份', aliases: ['西班牙五花'] },
  { name: '梅花豬', category: '肉品', unit: '份', supplier: '以曜', costPrice: 30, sellPrice: 180, spec: '120g/份', aliases: ['梅花','梅花肉','梅花豬'] },
  { name: '究好豬', category: '肉品', unit: '份', supplier: '品鮮璞', costPrice: 41, sellPrice: 300, spec: '120g/份', aliases: ['究好豬'] },
  { name: '羊肉捲', category: '肉品', unit: '份', supplier: '以曜', costPrice: 46, sellPrice: 180, spec: '120g/份', aliases: ['羊肉','羊捲','羊肉捲'] },
  { name: '羊五花', category: '肉品', unit: '份', supplier: '以曜', costPrice: 46, sellPrice: 180, spec: '120g/份', aliases: ['羊五花'] },
  { name: '午餐肉', category: '肉品', unit: '份', supplier: '悠西', costPrice: 42, sellPrice: 200, spec: '110g/份', aliases: ['午餐肉','SPAM'] },
  { name: '嫩肉片', category: '肉品', unit: '份', supplier: '以曜', costPrice: 38, sellPrice: 200, spec: '150g/份', aliases: ['嫩肉片'] },
  { name: '無骨雞腿肉', category: '肉品', unit: '份', supplier: '綠盛', costPrice: 30, sellPrice: 180, spec: '120g/份', aliases: ['雞腿','雞肉','雞腿肉'] },

  // ── 海鮮（瑞濱海鮮）──
  { name: '白蝦(40/50)', category: '海鮮', unit: '份', supplier: '瑞濱海鮮', costPrice: 34, sellPrice: 120, spec: '5隻/份', aliases: ['蝦','白蝦','蝦子'] },
  { name: '巴沙魚', category: '海鮮', unit: '份', supplier: '瑞濱海鮮', costPrice: 14, sellPrice: 150, spec: '150g/份', aliases: ['巴沙','巴沙魚','鯰魚'] },
  { name: '鱸魚', category: '海鮮', unit: '份', supplier: '瑞濱海鮮', costPrice: 55, sellPrice: 180, spec: '150g/份', aliases: ['鱸魚'] },
  { name: '白帶魚卷', category: '海鮮', unit: '份', supplier: '瑞濱海鮮', costPrice: 53, sellPrice: 120, spec: '500g', aliases: ['白帶魚','帶魚'] },
  { name: '刻花魷魚', category: '海鮮', unit: '份', supplier: '瑞濱海鮮', costPrice: 28, sellPrice: 120, spec: '150g/份', aliases: ['魷魚','花枝'] },
  { name: '牡蠣', category: '海鮮', unit: '份', supplier: '台灣食研', costPrice: 80, sellPrice: 280, spec: '4顆/份', aliases: ['蚵仔','牡蠣'] },

  // ── 蔬菜（幕府為主）──
  { name: '高麗菜', category: '蔬菜', unit: '份', supplier: '幕府', costPrice: 5, sellPrice: 100, spec: '150g/份', aliases: ['高麗菜','包心菜','甘藍'] },
  { name: '大白菜', category: '蔬菜', unit: '份', supplier: '幕府', costPrice: 5, sellPrice: 80, spec: '150g/份', aliases: ['大白菜'] },
  { name: '娃娃菜', category: '蔬菜', unit: '份', supplier: '幕府', costPrice: 19, sellPrice: 100, spec: '2株/份', aliases: ['娃娃菜','小白菜'] },
  { name: '山茼蒿', category: '蔬菜', unit: '份', supplier: '幕府', costPrice: 12, sellPrice: 120, spec: '120g/份', aliases: ['茼蒿','山茼蒿'] },
  { name: '奶油白菜', category: '蔬菜', unit: '份', supplier: '幕府', costPrice: 10, sellPrice: 120, spec: '120g/份', aliases: ['奶油白菜'] },
  { name: '皇宮菜', category: '蔬菜', unit: '份', supplier: '幕府', costPrice: 10, sellPrice: 120, spec: '100g/份', aliases: ['皇宮菜'] },
  { name: '蓮藕', category: '蔬菜', unit: '份', supplier: '幕府', costPrice: 16, sellPrice: 100, spec: '120g/份', aliases: ['蓮藕'] },
  { name: '馬鈴薯', category: '蔬菜', unit: '份', supplier: '幕府', costPrice: 6, sellPrice: 100, spec: '120g/份', aliases: ['馬鈴薯'] },
  { name: '台灣山藥', category: '蔬菜', unit: '份', supplier: '幕府', costPrice: 19, sellPrice: 100, spec: '120g/份', aliases: ['山藥(台灣)'] },
  { name: '日本山藥', category: '蔬菜', unit: '份', supplier: '綠盛', costPrice: 30, sellPrice: 150, spec: '120g/份', aliases: ['日本山藥','山藥(日本)'] },
  { name: '南瓜', category: '蔬菜', unit: '份', supplier: '幕府', costPrice: 8, sellPrice: 100, spec: '120g/份', aliases: ['南瓜'] },
  { name: '白蘿蔔', category: '蔬菜', unit: '份', supplier: '幕府', costPrice: 5, sellPrice: 80, spec: '120g/份', aliases: ['白蘿蔔','蘿蔔'] },
  { name: '海帶芽', category: '蔬菜', unit: '份', supplier: '韓流', costPrice: 10, sellPrice: 80, spec: '150g/份', aliases: ['海帶','海帶芽'] },
  { name: '玉米', category: '蔬菜', unit: '份', supplier: '幕府', costPrice: 8, sellPrice: 80, spec: '120g/份', aliases: ['玉米'] },
  { name: '玉米筍', category: '蔬菜', unit: '份', supplier: '幕府', costPrice: 15, sellPrice: 120, spec: '1盒/份', aliases: ['玉米筍'] },

  // ── 菇類（幕府）──
  { name: '金針菇', category: '菇類', unit: '份', supplier: '幕府', costPrice: 13, sellPrice: 100, spec: '1包/份', aliases: ['金針菇','金菇'] },
  { name: '鴻喜菇', category: '菇類', unit: '份', supplier: '幕府', costPrice: 13, sellPrice: 100, spec: '80g/份', aliases: ['鴻喜菇'] },
  { name: '袖珍菇', category: '菇類', unit: '份', supplier: '幕府', costPrice: 12, sellPrice: 100, spec: '80g/份', aliases: ['袖珍菇'] },
  { name: '小香菇', category: '菇類', unit: '份', supplier: '幕府', costPrice: 11, sellPrice: 80, spec: '80g/份', aliases: ['香菇','小香菇'] },
  { name: '黑木耳', category: '菇類', unit: '份', supplier: '幕府', costPrice: 9, sellPrice: 80, spec: '120g/份', aliases: ['木耳','黑木耳'] },
  { name: '綜合菇', category: '菇類', unit: '份', supplier: '幕府', costPrice: 30, sellPrice: 220, spec: '180g/份', aliases: ['綜合菇'] },

  // ── 豆製品（韓流/瑞濱）──
  { name: '凍豆腐', category: '豆製品', unit: '份', supplier: '瑞濱海鮮', costPrice: 8, sellPrice: 80, spec: '8塊/份', aliases: ['豆腐','凍豆腐'] },
  { name: '百頁豆腐', category: '豆製品', unit: '份', supplier: '瑞濱海鮮', costPrice: 11, sellPrice: 80, spec: '1份', aliases: ['百頁','百頁豆腐'] },
  { name: '板豆腐', category: '豆製品', unit: '份', supplier: '韓流', costPrice: 8, sellPrice: 80, spec: '6塊/份', aliases: ['板豆腐'] },
  { name: '生豆包', category: '豆製品', unit: '份', supplier: '韓流', costPrice: 10, sellPrice: 80, spec: '3塊/份', aliases: ['豆包','生豆包'] },
  { name: '炸豆皮', category: '豆製品', unit: '份', supplier: '韓流', costPrice: 8, sellPrice: 80, spec: '60g/份', aliases: ['豆皮','炸豆皮'] },
  { name: '鴨血', category: '豆製品', unit: '份', supplier: '韓流', costPrice: 10, sellPrice: 60, spec: '6塊/份', aliases: ['鴨血'] },
  { name: '響鈴捲', category: '豆製品', unit: '份', supplier: '淘寶/天貓', costPrice: 15, sellPrice: 150, spec: '5塊/份', aliases: ['響鈴','響鈴捲'] },
  { name: '火鍋豆筋', category: '豆製品', unit: '份', supplier: '淘寶/天貓', costPrice: 12, sellPrice: 100, spec: '60g/份', aliases: ['豆筋'] },

  // ── 火鍋料 ──
  { name: '手工蛋餃', category: '火鍋料', unit: '份', supplier: '小ㄚ姨', costPrice: 32, sellPrice: 150, spec: '4顆/份', aliases: ['蛋餃'] },
  { name: '手工川丸子', category: '火鍋料', unit: '份', supplier: '小ㄚ姨', costPrice: 30, sellPrice: 150, spec: '4顆/份', aliases: ['川丸','川丸子'] },
  { name: '魚餃', category: '火鍋料', unit: '份', supplier: '瑞濱海鮮', costPrice: 12, sellPrice: 100, spec: '4顆/份', aliases: ['魚餃'] },
  { name: '蝦餃', category: '火鍋料', unit: '份', supplier: '瑞濱海鮮', costPrice: 12, sellPrice: 100, spec: '4顆/份', aliases: ['蝦餃'] },
  { name: '水晶餃', category: '火鍋料', unit: '份', supplier: '韓流', costPrice: 12, sellPrice: 100, spec: '4顆/份', aliases: ['水晶餃'] },
  { name: '原味貢丸', category: '火鍋料', unit: '份', supplier: '韓流', costPrice: 15, sellPrice: 120, spec: '5顆/份', aliases: ['貢丸'] },
  { name: '香菇貢丸', category: '火鍋料', unit: '份', supplier: '韓流', costPrice: 15, sellPrice: 120, spec: '5顆/份', aliases: ['香菇貢丸'] },
  { name: '芋頭貢丸', category: '火鍋料', unit: '份', supplier: '韓流', costPrice: 15, sellPrice: 120, spec: '5顆/份', aliases: ['芋頭貢丸'] },
  { name: '花枝丸', category: '火鍋料', unit: '份', supplier: '韓流', costPrice: 18, sellPrice: 120, spec: '5顆/份', aliases: ['花枝丸'] },
  { name: '綜合貢丸', category: '火鍋料', unit: '份', supplier: '韓流', costPrice: 15, sellPrice: 120, spec: '6顆/份', aliases: ['綜合貢丸'] },
  { name: '綜合手做', category: '火鍋料', unit: '份', supplier: '韓流', costPrice: 60, sellPrice: 300, spec: '5種/份', aliases: ['綜合手做'] },
  { name: '花枝漿', category: '火鍋料', unit: '份', supplier: '韓流', costPrice: 25, sellPrice: 200, spec: '60g/份', aliases: ['花枝漿'] },
  { name: '蝦滑', category: '火鍋料', unit: '份', supplier: '韓流', costPrice: 25, sellPrice: 180, spec: '60g/份', aliases: ['蝦滑'] },
  { name: '雞滑', category: '火鍋料', unit: '份', supplier: '台灣食研', costPrice: 20, sellPrice: 160, spec: '60g/份', aliases: ['雞滑'] },
  { name: '芋頭心', category: '火鍋料', unit: '份', supplier: '韓流', costPrice: 10, sellPrice: 80, spec: '6顆/份', aliases: ['芋頭心'] },

  // ── 特色/內臟（市場直購）──
  { name: '手撕鮮毛肚', category: '特色', unit: '份', supplier: '市場直購', costPrice: 60, sellPrice: 220, spec: '150g/份', aliases: ['毛肚'] },
  { name: '掛面鴨腸', category: '特色', unit: '份', supplier: '市場直購', costPrice: 30, sellPrice: 220, spec: '150g/份', aliases: ['鴨腸'] },
  { name: '腰片', category: '特色', unit: '份', supplier: '市場直購', costPrice: 40, sellPrice: 220, spec: '150g/份', aliases: ['腰片','腰子'] },
  { name: '黃喉', category: '特色', unit: '份', supplier: '市場直購', costPrice: 35, sellPrice: 200, spec: '150g/份', aliases: ['黃喉'] },
  { name: '豬肝', category: '特色', unit: '份', supplier: '市場直購', costPrice: 15, sellPrice: 180, spec: '150g/份', aliases: ['豬肝'] },
  { name: '腦花', category: '特色', unit: '顆', supplier: '市場直購', costPrice: 44, sellPrice: 80, spec: '1顆', aliases: ['腦花'] },
  { name: '鵪鶉蛋', category: '特色', unit: '份', supplier: '市場直購', costPrice: 10, sellPrice: 80, spec: '8顆/份', aliases: ['鵪鶉蛋'] },
  { name: '花膠', category: '特色', unit: '份', supplier: '市場直購', costPrice: 60, sellPrice: 220, spec: '150g/份', aliases: ['花膠'] },
  { name: '貢菜', category: '特色', unit: '份', supplier: '淘寶/天貓', costPrice: 15, sellPrice: 100, spec: '100g/份', aliases: ['貢菜'] },
  { name: '竹蓀', category: '特色', unit: '份', supplier: '淘寶/天貓', costPrice: 8, sellPrice: 150, spec: '10g/份', aliases: ['竹蓀'] },
  { name: '紅糖糍粑', category: '特色', unit: '份', supplier: '淘寶/天貓', costPrice: 20, sellPrice: 150, spec: '5個/份', aliases: ['糍粑','紅糖糍粑'] },
  { name: '酥肉', category: '特色', unit: '份', supplier: '市場直購', costPrice: 30, sellPrice: 200, spec: '80g/份', aliases: ['酥肉'] },
  { name: '老油條', category: '特色', unit: '份', supplier: '津鼎', costPrice: 15, sellPrice: 220, spec: '6塊/份', aliases: ['油條','老油條'] },
  { name: '滷肥腸', category: '特色', unit: '份', supplier: '市場直購', costPrice: 50, sellPrice: 300, spec: '60g/份', aliases: ['肥腸','滷肥腸'] },
  { name: '滷雞腳', category: '特色', unit: '份', supplier: '市場直購', costPrice: 30, sellPrice: 220, spec: '5支/份', aliases: ['雞腳','滷雞腳'] },
  { name: '滷牛筋', category: '特色', unit: '份', supplier: '市場直購', costPrice: 40, sellPrice: 220, spec: '60g/份', aliases: ['牛筋','滷牛筋'] },
  { name: '滷牛肚', category: '特色', unit: '份', supplier: '市場直購', costPrice: 35, sellPrice: 220, spec: '60g/份', aliases: ['滷牛肚'] },

  // ── 飲料（鉊玖）──
  { name: '可爾必思', category: '飲料', unit: '瓶', supplier: '鉊玖', costPrice: 38, sellPrice: 80, aliases: ['可爾必思'] },
  { name: '麥仔茶', category: '飲料', unit: '瓶', supplier: '鉊玖', costPrice: 27, sellPrice: 80, aliases: ['麥仔茶'] },
  { name: '每朝綠茶', category: '飲料', unit: '瓶', supplier: '鉊玖', costPrice: 25, sellPrice: 80, aliases: ['每朝綠茶','綠茶'] },
  { name: '每朝紅茶', category: '飲料', unit: '瓶', supplier: '鉊玖', costPrice: 25, sellPrice: 80, aliases: ['每朝紅茶','紅茶'] },
  { name: '酸梅湯', category: '飲料', unit: '瓶', supplier: '鉊玖', costPrice: 25, sellPrice: 80, aliases: ['酸梅湯'] },
  { name: '可樂', category: '飲料', unit: '罐', supplier: '鉊玖', costPrice: 12, sellPrice: 30, aliases: ['可樂'] },
  { name: '雪碧', category: '飲料', unit: '罐', supplier: '鉊玖', costPrice: 12, sellPrice: 30, aliases: ['雪碧'] },
  { name: '加多寶', category: '飲料', unit: '罐', supplier: '鉊玖', costPrice: 20, sellPrice: 60, aliases: ['加多寶'] },
  { name: '礦泉水', category: '飲料', unit: '瓶', supplier: '鉊玖', costPrice: 8, sellPrice: 30, aliases: ['礦泉水','水'] },
  { name: '沙士', category: '飲料', unit: '罐', supplier: '鉊玖', costPrice: 15, sellPrice: 60, aliases: ['沙士'] },
  { name: '芭樂汁', category: '飲料', unit: '瓶', supplier: '鉊玖', costPrice: 20, sellPrice: 80, aliases: ['芭樂汁'] },

  // ── 酒類 ──
  { name: '台灣啤酒', category: '酒類', unit: '瓶', supplier: '鉊玖', costPrice: 47, sellPrice: 100, aliases: ['台啤','台灣啤酒'] },
  { name: '金牌啤酒', category: '酒類', unit: '瓶', supplier: '鉊玖', costPrice: 48, sellPrice: 100, aliases: ['金牌'] },
  { name: '18天', category: '酒類', unit: '瓶', supplier: '鉊玖', costPrice: 70, sellPrice: 130, aliases: ['18天','十八天'] },
  { name: '海尼根', category: '酒類', unit: '瓶', supplier: '鉊玖', costPrice: 78, sellPrice: 130, aliases: ['海尼根'] },
  { name: '百威金尊', category: '酒類', unit: '瓶', supplier: '鉊玖', costPrice: 68, sellPrice: 130, aliases: ['百威金尊','百威'] },
  { name: '紅百威', category: '酒類', unit: '瓶', supplier: '鉊玖', costPrice: 68, sellPrice: 130, aliases: ['紅百威'] },
  { name: '青島', category: '酒類', unit: '瓶', supplier: '鉊玖', costPrice: 60, sellPrice: 130, aliases: ['青島'] },
  { name: '真露-原味', category: '酒類', unit: '瓶', supplier: '大韓', costPrice: 84, sellPrice: 220, aliases: ['真露','真露原味'] },
  { name: '真露-草莓', category: '酒類', unit: '瓶', supplier: '鉊玖', costPrice: 90, sellPrice: 250, aliases: ['真露草莓'] },
  { name: '真露-水蜜桃', category: '酒類', unit: '瓶', supplier: '鉊玖', costPrice: 90, sellPrice: 250, aliases: ['真露水蜜桃'] },
  { name: '真露-葡萄柚', category: '酒類', unit: '瓶', supplier: '鉊玖', costPrice: 90, sellPrice: 250, aliases: ['真露葡萄柚'] },
  { name: '真露-蜜桃李', category: '酒類', unit: '瓶', supplier: '鉊玖', costPrice: 90, sellPrice: 250, aliases: ['真露蜜桃李'] },
  { name: '百富12年', category: '酒類', unit: '瓶', supplier: '鉊玖', costPrice: 1450, sellPrice: 3000, aliases: ['百富','百富12年'] },
];

async function seed() {
  console.log('🌱 開始匯入初始資料...\n');

  // 1. 匯入門市
  console.log('🏪 匯入門市...');
  const insertedStores = await db.insert(schema.stores).values(STORES).returning();
  console.log(`   ✅ ${insertedStores.length} 間門市`);

  // 2. 匯入供應商
  console.log('🚚 匯入供應商...');
  const insertedSuppliers = await db.insert(schema.suppliers).values(SUPPLIERS).returning();
  console.log(`   ✅ ${insertedSuppliers.length} 家供應商`);

  // 建立供應商名稱 → ID 對照
  const supplierMap = new Map<string, number>();
  for (const s of insertedSuppliers) {
    supplierMap.set(s.name, s.id);
  }

  // 3. 匯入品項
  console.log('🍲 匯入品項...');
  const itemValues: schema.NewItem[] = ITEMS.map((item) => {
    const supplierId = supplierMap.get(item.supplier);
    if (!supplierId) {
      throw new Error(`找不到供應商：${item.supplier}（品項：${item.name}）`);
    }
    return {
      name: item.name,
      category: item.category,
      unit: item.unit,
      supplierId,
      costPrice: item.costPrice,
      sellPrice: item.sellPrice,
      spec: item.spec ?? null,
      aliases: item.aliases,
    };
  });
  const insertedItems = await db.insert(schema.items).values(itemValues).returning();
  console.log(`   ✅ ${insertedItems.length} 個品項`);

  // 4. 建立老闆帳號
  console.log('👤 建立老闆帳號...');
  const ownerPinHash = await hash('1234', 10);
  const [owner] = await db.insert(schema.users).values({
    name: '張銘瑋',
    employeeId: 'E001',
    phone: '0900000001',
    pinHash: ownerPinHash,
    role: 'admin',
  }).returning();
  console.log(`   ✅ 管理員帳號：${owner.name}（員工編號：E001，密碼：1234）`);

  // 建立測試員工帳號
  const staffPinHash = await hash('0000', 10);
  const [staff1] = await db.insert(schema.users).values({
    name: '林森店員工',
    employeeId: 'E002',
    phone: '0900000002',
    pinHash: staffPinHash,
    role: 'staff',
    storeId: insertedStores[0].id,
  }).returning();
  const [staff2] = await db.insert(schema.users).values({
    name: '信義店員工',
    employeeId: 'E003',
    phone: '0900000003',
    pinHash: staffPinHash,
    role: 'staff',
    storeId: insertedStores[1].id,
  }).returning();
  console.log(`   ✅ 測試員工：${staff1.name}（E002, 密碼：0000）、${staff2.name}（E003, 密碼：0000）`);

  console.log('\n🎉 初始資料匯入完成！');
  console.log('\n📋 登入資訊：');
  console.log('   老闆：手機 0900000001，PIN 1234');
  console.log('   林森店員工：手機 0900000002，PIN 0000');
  console.log('   信義店員工：手機 0900000003，PIN 0000');
}

seed().catch((err) => {
  console.error('❌ Seed 失敗：', err);
  process.exit(1);
});

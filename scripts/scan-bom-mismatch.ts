/**
 * 一次性 — 掃描 bom_items 裡 ingredient_name 跟對到的 item.name 不一致的情況
 * 規則:
 *   1. normalize ingredient_name(去【XX半】前綴、去（綠盛）後綴)
 *   2. 計算「共同字比例」= 共同字數 / min(len(name1), len(name2))
 *   3. 比例 < 0.5 → 標可疑
 *   4. 對可疑筆,找 items 全表 fuzzy match,給 top 3 候選
 * 跑完輸出 markdown 給 Terry 逐筆拍板
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { writeFileSync } from 'fs';

config({ path: '.env.local' });

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

function normalize(name: string): string {
  return name
    .replace(/^【.+?】/, '')                                 // 去【XX半】
    .replace(/\s*[（(]\s*(綠盛|韓流|幕府)\s*[）)]\s*/g, '')   // 去（綠盛）
    .replace(/\s+/g, '')
    .trim();
}

function commonChars(a: string, b: string): number {
  const setA = new Set(a);
  let cnt = 0;
  for (const ch of new Set(b)) if (setA.has(ch)) cnt++;
  return cnt;
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 1;
  const common = commonChars(na, nb);
  return common / Math.min(na.length, nb.length);
}

type BomRow = {
  id: number;
  menu_id: number;
  menu_name: string;
  ingredient_name: string;
  item_id: number | null;
  item_name: string | null;
  supplier_name: string | null;
  aliases: string[] | null;
  quantity: string;
};

type ItemRow = { id: number; name: string; aliases: string[] | null; supplier_name: string };

async function main() {
  const bomRows = await sql`
    SELECT
      b.id, b.menu_item_id as menu_id, m.name as menu_name,
      b.ingredient_name, b.item_id,
      i.name as item_name, s.name as supplier_name, i.aliases,
      b.quantity
    FROM bom_items b
    LEFT JOIN menu_items m ON b.menu_item_id = m.id
    LEFT JOIN items i ON b.item_id = i.id
    LEFT JOIN suppliers s ON i.supplier_id = s.id
    WHERE b.item_id IS NOT NULL
    ORDER BY m.category NULLS LAST, m.name, b.sort_order
  ` as unknown as BomRow[];

  const allItems = await sql`
    SELECT i.id, i.name, i.aliases, s.name as supplier_name
    FROM items i LEFT JOIN suppliers s ON i.supplier_id = s.id
    WHERE i.is_active
  ` as unknown as ItemRow[];

  const suspect: Array<{ row: BomRow; score: number; candidates: Array<{ item: ItemRow; score: number }> }> = [];
  const ok: BomRow[] = [];

  for (const row of bomRows) {
    if (!row.item_name) continue;
    // aliases 命中 → OK
    const aliasHit = (row.aliases ?? []).some(a => normalize(a) === normalize(row.ingredient_name));
    const score = aliasHit ? 1 : similarity(row.ingredient_name, row.item_name);

    if (score >= 0.5) {
      ok.push(row);
      continue;
    }

    // 可疑 — 找候選
    const target = normalize(row.ingredient_name);
    const candidates = allItems
      .map(item => ({ item, score: similarity(target, item.name) }))
      .filter(c => c.score >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    suspect.push({ row, score, candidates });
  }

  // ── 輸出 ──
  const lines: string[] = [];
  lines.push('# BOM.item_id 可疑錯指掃描');
  lines.push('');
  lines.push(`**統計**:`);
  lines.push(`- BOM 有 item_id 的:**${bomRows.length}** 筆`);
  lines.push(`- 看起來對的(score ≥ 0.5):**${ok.length}** 筆`);
  lines.push(`- ⚠️ 可疑(score < 0.5):**${suspect.length}** 筆`);
  lines.push('');
  lines.push('## ⚠️ 可疑錯指清單 — 逐筆拍板');
  lines.push('');
  lines.push('| # | 菜品 | BOM 食材名 | 目前對到 | 供應商 | score | 候選 1 | 候選 2 | 候選 3 |');
  lines.push('|---|---|---|---|---|---|---|---|---|');

  for (let i = 0; i < suspect.length; i++) {
    const { row, score, candidates } = suspect[i];
    const cand = (n: number) => {
      const c = candidates[n];
      if (!c) return '—';
      return `${c.item.name}<br>(${c.item.supplier_name}, score=${c.score.toFixed(2)})`;
    };
    lines.push(
      `| ${i + 1} | ${row.menu_name} | **${row.ingredient_name}** | ${row.item_name}<br>(${row.supplier_name}) | — | ${score.toFixed(2)} | ${cand(0)} | ${cand(1)} | ${cand(2)} |`
    );
  }

  lines.push('');
  lines.push('## 候選 score 解讀');
  lines.push('- `1.00` = 完全相符 或 一個包含另一個');
  lines.push('- `0.50~0.99` = 多數字相同(中文 token 共字)');
  lines.push('- `< 0.50` = 大部分字不同 → 可疑');
  lines.push('');
  lines.push('## 處理建議');
  lines.push('對每筆可疑,你可選:');
  lines.push('1. ✅ 採用候選 1/2/3 之一 — 我寫 update SQL');
  lines.push('2. 🆕 上述都不對,你提供正確 SKU id 或要我建新 SKU');
  lines.push('3. 🗑 這筆 BOM 不該存在 — 刪除');
  lines.push('4. ➖ 沒對應的 SKU(如「水」「熱水」) — 把 item_id 設 NULL,只保留 ingredient_name');

  const out = lines.join('\n');
  writeFileSync('/tmp/bom-mismatch-suspects.md', out);

  // 也輸出純文字供 console
  console.log(`\n📊 掃描結果`);
  console.log(`   ${bomRows.length} 筆有 item_id`);
  console.log(`   ${ok.length} 筆看起來對`);
  console.log(`   ⚠️  ${suspect.length} 筆可疑`);
  console.log(`\n📄 完整清單已寫入 /tmp/bom-mismatch-suspects.md\n`);
  console.log('## 可疑清單預覽(前 20 筆):');
  console.log();

  for (let i = 0; i < Math.min(suspect.length, 20); i++) {
    const { row, score, candidates } = suspect[i];
    console.log(`${(i + 1).toString().padStart(2)}. [${row.menu_name}]`);
    console.log(`    BOM 食材名: 「${row.ingredient_name}」(用量 ${row.quantity})`);
    console.log(`    目前對到:   「${row.item_name}」(${row.supplier_name}) score=${score.toFixed(2)}`);
    if (candidates.length > 0) {
      const top = candidates[0];
      console.log(`    候選 1:     「${top.item.name}」(${top.item.supplier_name}) score=${top.score.toFixed(2)}`);
      if (candidates[1]) {
        console.log(`    候選 2:     「${candidates[1].item.name}」(${candidates[1].item.supplier_name}) score=${candidates[1].score.toFixed(2)}`);
      }
    } else {
      console.log(`    候選:       無 — items 表找不到夠像的`);
    }
    console.log();
  }

  if (suspect.length > 20) {
    console.log(`... 還有 ${suspect.length - 20} 筆,看 /tmp/bom-mismatch-suspects.md`);
  }

  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });

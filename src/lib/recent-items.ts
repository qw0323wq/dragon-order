/**
 * localStorage 最近使用品項 — 共用工廠函式
 *
 * 用法：
 *   const recent = createRecentStore("dragon-order-recent-waste", 6);
 *   const ids = recent.get();
 *   recent.save([1, 2, 3]);
 */

const DEFAULT_MAX = 6;

export function createRecentStore(key: string, max: number = DEFAULT_MAX) {
  return {
    /** 讀取最近使用的品項 ID 列表 */
    get(): number[] {
      try {
        return JSON.parse(localStorage.getItem(key) || "[]");
      } catch {
        return [];
      }
    },

    /** 儲存最近使用的品項 ID 列表（自動截斷） */
    save(ids: number[]): void {
      localStorage.setItem(key, JSON.stringify(ids.slice(0, max)));
    },

    /** 新增一個 ID 到最前面（去重） */
    add(id: number): number[] {
      const current = this.get();
      const next = [id, ...current.filter((x) => x !== id)].slice(0, max);
      this.save(next);
      return next;
    },
  };
}

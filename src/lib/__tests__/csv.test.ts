import { describe, it, expect } from "vitest";
import { escapeCsvValue, toCsv } from "../csv";

describe("escapeCsvValue", () => {
  it("原樣輸出不需跳脫的值", () => {
    expect(escapeCsvValue("高麗菜")).toBe("高麗菜");
    expect(escapeCsvValue(42)).toBe("42");
    expect(escapeCsvValue(-3.5)).toBe("-3.5");
  });

  it("null / undefined 變空字串", () => {
    expect(escapeCsvValue(null)).toBe("");
    expect(escapeCsvValue(undefined)).toBe("");
  });

  it("含逗號的值用雙引號包起來", () => {
    expect(escapeCsvValue("市場－邱章城, 大衛")).toBe('"市場－邱章城, 大衛"');
  });

  it("含雙引號的值：包起來且內部引號變兩個", () => {
    expect(escapeCsvValue('切肉機 24" 規格')).toBe('"切肉機 24"" 規格"');
  });

  it("含換行的值用雙引號包起來", () => {
    expect(escapeCsvValue("第一行\n第二行")).toBe('"第一行\n第二行"');
    expect(escapeCsvValue("第一行\r\n第二行")).toBe('"第一行\r\n第二行"');
  });

  it("只有引號的值也要跳脫（邊界）", () => {
    expect(escapeCsvValue('"')).toBe('""""');
  });

  it("字串開頭是公式字元時加單引號防注入", () => {
    expect(escapeCsvValue("=1+1")).toBe("'=1+1");
    expect(escapeCsvValue("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("負數（number）不被當公式，保持 Excel 可計算", () => {
    expect(escapeCsvValue(-5)).toBe("-5");
  });
});

describe("toCsv", () => {
  it("表頭 + 資料列，用 CRLF 分行", () => {
    const csv = toCsv(
      [
        ["高麗菜", 10],
        ["豬五花", 5],
      ],
      ["品項", "數量"],
    );
    expect(csv).toBe("品項,數量\r\n高麗菜,10\r\n豬五花,5");
  });

  it("沒有資料列時只輸出表頭", () => {
    expect(toCsv([], ["品項", "數量"])).toBe("品項,數量");
  });

  it("逐格跳脫，不讓逗號切斷欄位", () => {
    const csv = toCsv([["A,B", "C"]], ["x", "y"]);
    expect(csv).toBe('x,y\r\n"A,B",C');
  });

  it("不含 BOM（BOM 由 downloadCsv 在寫檔時加）", () => {
    expect(toCsv([], ["品項"]).startsWith("\uFEFF")).toBe(false);
  });
});

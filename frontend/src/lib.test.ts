import { describe, expect, it } from "vitest";
import { delta, fmt, fmtDate,refreshDelay,analyticsRefresh } from "./lib";
it('cache e remontagem não adiam o ciclo de atualização nem criam intervalo negativo',()=>{
  expect(refreshDelay(45000,1000,11000)).toBe(35000);
  expect(refreshDelay(15000,1000,31000)).toBe(1000);
  expect(refreshDelay(undefined,1000,1000)).toBe(60000);
  expect(refreshDelay(undefined,0,100000)).toBe(60000);
  expect(analyticsRefresh('ERROR',1000,1000)).toBe(false);
  expect(analyticsRefresh('error',1000,1000)).toBe(false);
});

// Valores sintéticos apenas para testar a formatação — nunca usados nas telas.
describe("fmt", () => {
  it("moeda, contagem, horas e percentual em pt-BR", () => {
    expect(fmt(1234.5, "BRL").replace(/\s/g, " ")).toBe("R$ 1.234,50");
    expect(fmt(1234, "count")).toBe("1.234");
    expect(fmt(12.34, "hours")).toBe("12,3 h");
    expect(fmt(0.256, "percent")).toBe("25,6%");
  });
  it("ausência de valor nunca vira zero", () => {
    for (const v of [null, undefined, ""]) expect(fmt(v, "BRL")).toBe("—");
  });
  it("datas no fuso de São Paulo", () => {
    expect(fmtDate("2026-11-24")).toBe("24/11/2026");
    expect(fmt("2026-11-24T02:30:00Z", "datetime")).toBe("23/11/2026, 23:30");
  });
});

describe("delta", () => {
  it("só calcula com base válida", () => {
    expect(delta(110, 100)).toBeCloseTo(0.1);
    expect(delta(110, 0)).toBeNull();
    expect(delta(110, null)).toBeNull();
    expect(delta("x", 100)).toBeNull();
  });
});

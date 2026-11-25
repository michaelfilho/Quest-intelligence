import assert from "node:assert/strict";
import { test } from "node:test";
import { readOnce, withReadContext } from "../src/read-once.js";
test("SELECTs idênticos compartilham leitura no pedido, mas escopos e pedidos não compartilham resultados", async () => {
  let count = 0;
  const read = async () => ++count;
  await withReadContext(async () => {
    const values = await Promise.all([readOnce("SELECT total", ["A"], read), readOnce("SELECT total", ["A"], read)]);
    assert.deepEqual(values, [1, 1]);
    assert.equal(await readOnce("SELECT total", ["A"], read), 1);
    assert.equal(await readOnce("SELECT total", ["B"], read), 2);
  });
  assert.equal(await withReadContext(() => readOnce("SELECT total", ["A"], read)), 3);
});
test("leitura simultânea entre pedidos é compartilhada apenas enquanto está pendente", async () => {
  let resolve!: (n: number) => void;
  let calls = 0;
  const read = () => { calls++; return new Promise<number>(r => resolve = r); };
  const a = withReadContext(() => readOnce("SELECT slow", [], read));
  const b = withReadContext(() => readOnce("SELECT slow", [], read));
  resolve(1); await Promise.all([a, b]); assert.equal(calls, 1);
  const c = withReadContext(() => readOnce("SELECT slow", [], read));
  resolve(2); assert.equal(await c, 2); assert.equal(calls, 2);
});

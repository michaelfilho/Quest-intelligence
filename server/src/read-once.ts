import { AsyncLocalStorage } from "node:async_hooks";

const context = new AsyncLocalStorage<Map<string, Promise<any>>>();
const pending = new Map<string, Promise<any>>();
export const withReadContext = <T>(fn: () => T) => context.run(new Map(), fn);

/** Só compartilha SELECTs idênticos: no pedido atual e enquanto a leitura está em curso.
 * Não guarda resultados entre pedidos, nem mistura parâmetros de departamentos diferentes. */
export function readOnce<T>(sql: string, params: unknown[], read: () => Promise<T>): Promise<T> {
  if (!/^\s*(SELECT|WITH)\b/i.test(sql)) return read();
  const key = JSON.stringify([sql, params]);
  const local = context.getStore();
  const found = local?.get(key) ?? pending.get(key);
  if (found) { local?.set(key, found); return found; }
  const promise = read();
  local?.set(key, promise);
  if (pending.size < 256) {
    pending.set(key, promise);
    void promise.then(() => pending.delete(key), () => pending.delete(key));
  }
  return promise;
}

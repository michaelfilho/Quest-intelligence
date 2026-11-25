/** Caminho público: usado uma vez pelo navegador e pelo Path do cookie. */
export function normalizeBasePath(value = "/") {
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]*\/?$/.test(value)) throw new Error("Base pública inválida");
  return value === "/" ? "/" : value.replace(/\/$/, "") + "/";
}

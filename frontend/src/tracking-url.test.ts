import { describe, expect, it, vi } from 'vitest';
import { cleanTrackingSearch, sanitizeTrackingUrl } from './tracking-url';

describe('URL de entrada', () => {
  it('remove todos os rastreadores, inclusive repetidos, codificados e com caixa diferente', () => {
    expect(cleanTrackingSearch('?utm_source=chatgpt.com&utm_custom=x&UTM_MEDIUM=y&%75tm_campaign=z&fbclid=1&gclid=2&dclid=3&msclkid=4&ttclid=5&igshid=6&mc_cid=7&mc_eid=8&fbclid=9')).toBe('');
  });
  it('preserva filtros, valores vazios, ordem, duplicatas e a codificação original', () => {
    expect(cleanTrackingSearch('?start=2026-01-01&client=Cria%C3%A7%C3%A3o%20%26%20Dados&utm_source=x&project=1&project=2&search=a+b%2Bc&empty=&compare=1')).toBe('?start=2026-01-01&client=Cria%C3%A7%C3%A3o%20%26%20Dados&project=1&project=2&search=a+b%2Bc&empty=&compare=1');
  });
  it('não confunde valores, nomes parecidos ou chaves malformadas com rastreadores', () => {
    const search = '?search=utm_source%3Dx&gclid_extra=1&xutm_source=2&%ZZ=3';
    expect(cleanTrackingSearch(search)).toBe(search);
  });
  it.each(['/core/', '/core/projetos/123', '/'])('preserva rota %s, fragmento e estado do histórico', pathname => {
    const state = { idx: 4, key: 'existing' }, replaceState = vi.fn();
    sanitizeTrackingUrl({ location: { pathname, search: '?utm_source=chatgpt.com&client=10', hash: '#atividade' }, history: { state, replaceState } } as unknown as Pick<Window, 'location' | 'history'>);
    expect(replaceState).toHaveBeenCalledExactlyOnceWith(state, '', pathname + '?client=10#atividade');
  });
  it('limpa o exemplo sem adicionar histórico nem recarregar a página', () => {
    const replaceState = vi.fn();
    sanitizeTrackingUrl({ location: new URL('https://questos.com.br/core/?utm_source=chatgpt.com'), history: { state: null, replaceState } } as unknown as Pick<Window, 'location' | 'history'>);
    expect(replaceState).toHaveBeenCalledExactlyOnceWith(null, '', '/core/');
  });
  it('não escreve no histórico quando a URL já está limpa', () => {
    const replaceState = vi.fn();
    sanitizeTrackingUrl({ location: new URL('https://questos.com.br/core/?client=1#detalhes'), history: { state: null, replaceState } } as unknown as Pick<Window, 'location' | 'history'>);
    expect(replaceState).not.toHaveBeenCalled();
  });
});

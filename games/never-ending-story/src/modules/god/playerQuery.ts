/** Query params for the God admin player list. */
export function playerPageParams(url: URL): { q: string; page: number; pageSize: number } {
  const q = (url.searchParams.get('q') ?? '').slice(0, 64);
  const pageSize = 20;
  const raw = Number(url.searchParams.get('page'));
  const page = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
  return { q, page, pageSize };
}

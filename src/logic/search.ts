export interface Candidate { path: string; name: string; fav: boolean; recent: boolean }

export const normalize = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Dedupes by path (case-insensitive), keeping the first spelling and OR-ing the flags. */
export function mergeCandidates(list: Candidate[]): Candidate[] {
  const map = new Map<string, Candidate>();
  for (const c of list) {
    const k = c.path.toLowerCase();
    const prev = map.get(k);
    if (prev) map.set(k, { ...prev, fav: prev.fav || c.fav, recent: prev.recent || c.recent });
    else map.set(k, { ...c });
  }
  return [...map.values()];
}

function score(c: Candidate, words: string[]): number {
  const name = normalize(c.name);
  const path = normalize(c.path);
  let total = 0;
  for (const w of words) {
    if (name.startsWith(w)) total += 30;
    else if (name.includes(w)) total += 20;
    else if (path.includes(w)) total += 5;
    else return -1;
  }
  return total + (c.fav ? 3 : 0) + (c.recent ? 2 : 0);
}

/** Every word must match name or path; name prefix > name substring > path substring. */
export function searchFolders(cands: Candidate[], query: string, limit = 50): Candidate[] {
  const list = mergeCandidates(cands);
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [...list.filter((c) => c.fav), ...list.filter((c) => !c.fav && c.recent)].slice(0, limit);
  return list
    .map((c, i) => ({ c, i, s: score(c, words) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s || a.c.name.length - b.c.name.length || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.c);
}

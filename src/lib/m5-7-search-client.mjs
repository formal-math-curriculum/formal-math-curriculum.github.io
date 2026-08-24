export function normalizeSearchToken(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/\b(?:multiplication|multiply|multiplied)\b/gu, 'times')
    .replace(/[()*+·×=⇒⟹,;{}\[\]]/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

function exactValues(row) {
  const meta = row?.meta ?? {};
  return [
    meta.title,
    meta['content-id'],
    ...(meta.identifiers ? String(meta.identifiers).split('|') : []),
    ...(meta.aliases ? String(meta.aliases).split('|') : [])
  ].map(normalizeSearchToken).filter(Boolean);
}

export function sortSearchRows(rows, query) {
  const normalized = normalizeSearchToken(query);
  return [...rows].sort((left, right) => {
    const leftExact = exactValues(left).includes(normalized);
    const rightExact = exactValues(right).includes(normalized);
    if (leftExact !== rightExact) return leftExact ? -1 : 1;
    if (leftExact && rightExact) return String(left.url).localeCompare(String(right.url), 'en');
    const score = Number(right.score ?? 0) - Number(left.score ?? 0);
    return score || String(left.url).localeCompare(String(right.url), 'en');
  });
}

export function buildPagefindFilters(selects) {
  const filters = { 'fmc-result-kind': 'learner-content' };
  for (const select of selects) {
    const key = select?.dataset?.fmcGlobalFilter;
    if (key && select.value) filters[key] = select.value;
  }
  return filters;
}

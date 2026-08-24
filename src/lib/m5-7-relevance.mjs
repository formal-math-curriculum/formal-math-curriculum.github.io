export const FROZEN_RELEVANCE_JUDGMENTS = Object.freeze([
  ['G01', 'Natural-number operation laws', { 'cnt:p5m56:000004': 3 }, 'T0'],
  ['G02', 'natural number laws', { 'cnt:p5m56:000004': 3 }, 'T0'],
  ['G03', 'cnt:p5m56:000004', { 'cnt:p5m56:000004': 3 }, 'T0'],
  ['G04', 'CAND-P1-000004', { 'cnt:p5m56:000004': 3, 'cnt:p5m56:000005': 3, 'cnt:p5m56:000006': 3 }, 'T0'],
  ['G05', 'Nat.instDistrib', { 'cnt:p5m56:000004': 3 }, 'T0'],
  ['G06', 'FART-P2-000010', { 'cnt:p5m56:000006': 3 }, 'T0'],
  ['G07', 'FLOC-P2-000002', { 'cnt:p5m56:000014': 3 }, 'T0'],
  ['G08', 'FormalMath.Algebra.factoredProduct_eq_zero_iff', { 'cnt:p5m56:000014': 3 }, 'T0'],
  ['G09', 'Mathlib.Algebra.Ring.Nat', { 'cnt:p5m56:000004': 3 }, 'T0'],
  ['G10', 'distribute cancel', { 'cnt:p5m56:000006': 3, 'cnt:p5m56:000003': 2, 'cnt:p5m56:000005': 2 }, 'T0'],
  ['G11', 'zero product', { 'cnt:p5m56:000012': 3, 'cnt:p5m56:000014': 3 }, 'T0'],
  ['G12', 'negative multiplication', { 'cnt:p5m56:000009': 3, 'cnt:p5m56:000010': 2 }, 'T0'],
  ['G13', '7 * (4 + 3)', { 'cnt:p5m56:000005': 3, 'cnt:p5m56:000006': 3 }, 'T0'],
  ['G14', 'roots two five', { 'cnt:p5m56:000015': 3 }, 'T0'],
  ['G15', '11A05', { 'validation:m57:000001': 3 }, 'T2'],
  ['G16', 'math.NT', { 'validation:m57:000002': 3 }, 'T2'],
  ['G17', 'urn:fmc:validation:m5-7:onto:parent-a', { 'validation:m57:000003': 3 }, 'T2'],
  ['G18', 'Portuguese distributive law', {}, 'T0'],
  ['G19', 'zzzz-no-governed-match', {}, 'T0'],
  ['G20', '   ', {}, 'T0']
].map(([id, query, grades, tier]) => Object.freeze({ id, query, grades: Object.freeze(grades), tier })));

export function computeRelevanceMetrics(resultIds, grades, k = 5) {
  const relevant = Object.entries(grades).filter(([, grade]) => grade > 0);
  if (relevant.length === 0) return { mrr: null, recallAt5: null, ndcgAt5: null };
  const top = resultIds.slice(0, k);
  const firstGradeThree = resultIds.findIndex((id) => (grades[id] ?? 0) === 3);
  const recallAt5 = relevant.filter(([id]) => top.includes(id)).length / relevant.length;
  const gain = (grade) => (2 ** grade) - 1;
  const dcg = top.reduce((total, id, index) => total + gain(grades[id] ?? 0) / Math.log2(index + 2), 0);
  const ideal = relevant.map(([, grade]) => grade).sort((left, right) => right - left).slice(0, k)
    .reduce((total, grade, index) => total + gain(grade) / Math.log2(index + 2), 0);
  return {
    mrr: firstGradeThree === -1 ? 0 : 1 / (firstGradeThree + 1),
    recallAt5,
    ndcgAt5: ideal === 0 ? null : dcg / ideal
  };
}

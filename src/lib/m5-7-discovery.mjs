import { createHash } from 'node:crypto';
import { normalizeSearchToken } from './m5-7-search-client.mjs';

export const DISCOVERY_SCHEMA = 'p5-m5.7-search-discovery/v1';
export const DISCOVERY_FREEZE_DOCUMENT = 'd879fd37-8602-4cf2-b3a8-aa19d0a6e588';
export const SCALE_FIXTURE_ID = 'P5-M5.7-SCALE-v1';
export const SCALE_FIXTURE_SEED = 'sha256("P5-M5.7-SCALE-v1|site:b0661b5ab61d0b4a8acb50f59339c988e5c6158e|content:2da8fdb43074d00fea5fc6201d239e5f26a43250")';

export const PAGEFIND_RANKING = Object.freeze({
  termFrequency: 0.85,
  termSimilarity: 1,
  pageLength: 0.5,
  termSaturation: 1.2,
  metaWeights: {
    title: 10,
    'content-id': 12,
    identifiers: 10,
    aliases: 7,
    summary: 3
  }
});

const filterDefinitions = [
  ['content-kind', 'Content kind'],
  ['editorial-state', 'Editorial state'],
  ['formal-state', 'Formal state'],
  ['publication-state', 'Publication state'],
  ['representation', 'Representation'],
  ['locale', 'Locale'],
  ['translation-state', 'Translation state']
];

export const GLOBAL_JUDGMENTS = Object.freeze([
  ['G01', 'Natural-number operation laws', ['cnt:p5m56:000004']],
  ['G02', 'natural number laws', ['cnt:p5m56:000004']],
  ['G03', 'cnt:p5m56:000004', ['cnt:p5m56:000004']],
  ['G04', 'CAND-P1-000004', ['cnt:p5m56:000004', 'cnt:p5m56:000005', 'cnt:p5m56:000006']],
  ['G05', 'Nat.instDistrib', ['cnt:p5m56:000004']],
  ['G06', 'FART-P2-000010', ['cnt:p5m56:000006']],
  ['G07', 'FLOC-P2-000002', ['cnt:p5m56:000014']],
  ['G08', 'FormalMath.Algebra.factoredProduct_eq_zero_iff', ['cnt:p5m56:000014']],
  ['G09', 'Mathlib.Algebra.Ring.Nat', ['cnt:p5m56:000004']],
  ['G10', 'distribute cancel', ['cnt:p5m56:000006']],
  ['G11', 'zero product', ['cnt:p5m56:000012', 'cnt:p5m56:000014']],
  ['G12', 'negative multiplication', ['cnt:p5m56:000009', 'cnt:p5m56:000010']],
  ['G13', '7 * (4 + 3)', ['cnt:p5m56:000005', 'cnt:p5m56:000006']],
  ['G14', 'roots two five', ['cnt:p5m56:000015']],
  ['G15', '11A05', ['validation:m57:000001']],
  ['G16', 'math.NT', ['validation:m57:000002']],
  ['G17', 'urn:fmc:validation:m5-7:onto:parent-a', ['validation:m57:000003']],
  ['G18', 'Portuguese distributive law', []],
  ['G19', 'zzzz-no-governed-match', []],
  ['G20', '   ', []]
].map(([id, query, required]) => Object.freeze({ id, query, required: Object.freeze(required) })));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort((left, right) => left.localeCompare(right, 'en'));
}

function label(value) {
  return String(value).replaceAll('_', ' ').replaceAll('-', ' ');
}

export function buildDiscoveryModel(bundle) {
  const entities = new Map(bundle.publication.content.map((entity) => [entity.content_id, entity]));
  const seen = new Set();
  const errors = [];
  const documents = bundle.search.documents.map((record) => {
    const entity = entities.get(record.content_id);
    if (!entity) errors.push(`search document has no publication entity: ${record.content_id}`);
    if (seen.has(record.content_id)) errors.push(`duplicate discovery identity: ${record.content_id}`);
    seen.add(record.content_id);
    const route = entity ? `/content/${entity.route_key}/${entity.slug}/` : record.canonical_route;
    if (route !== record.canonical_route) errors.push(`discovery route mismatch: ${record.content_id}`);
    const modules = sortedUnique((entity?.blocks ?? []).map((block) => block.lean?.module));
    const identifiers = sortedUnique([
      record.content_id,
      record.curriculum_candidate_id,
      ...(record.formal_ids ?? []),
      ...(record.declarations ?? []),
      ...modules
    ]);
    const aliases = sortedUnique([...(record.search_terms ?? []), entity?.route_key, entity?.slug]);
    const representations = entity?.blocks?.length ? ['latex', 'lean', 'rendered'] : ['narrative-only'];
    const locale = entity?.locales?.find((candidate) => candidate.locale === 'en');
    const translationStates = sortedUnique((entity?.locales ?? []).map((candidate) => candidate.translation_state));
    const bodySearchFields = [
      ...(entity?.narrative ?? []),
      entity?.exercise?.prompt,
      ...(entity?.exercise?.checkpoints ?? []),
      entity?.exercise?.diagnostic,
      ...(entity?.blocks ?? []).flatMap((block) => [
        block.title,
        block.rendered,
        block.latex,
        block.lean?.source
      ])
    ];
    return {
      schemaVersion: DISCOVERY_SCHEMA,
      contentId: record.content_id,
      canonicalRoute: record.canonical_route,
      title: record.title,
      summary: record.summary,
      kind: record.kind,
      editorialState: entity?.maturity?.editorial,
      formalState: entity?.maturity?.formal,
      publicationState: entity?.maturity?.publication,
      representations,
      locale: locale?.locale ?? 'en',
      translationStates,
      identifiers,
      aliases,
      sourceRevision: bundle.provenance.exact_revisions.content,
      contentAuthorityRevision: bundle.provenance.source_identity,
      validationOnly: false,
      searchText: normalizeSearchToken(sortedUnique([
        record.title,
        record.summary,
        ...(record.objectives ?? []),
        ...identifiers,
        ...aliases,
        ...bodySearchFields
      ]).join(' '))
    };
  });
  if (documents.length !== entities.size) errors.push('discovery corpus cardinality mismatch');
  if (documents.some((document) => /urn:fmc:validation|FMC-M5[67]|fmc\.m5[67]/iu.test(JSON.stringify(document)))) {
    errors.push('validation identifier leaked into production discovery corpus');
  }
  if (errors.length) throw new Error(`M5.7 discovery model rejected:\n${errors.join('\n')}`);

  const filters = filterDefinitions.map(([id, filterLabel]) => ({
    id,
    label: filterLabel,
    options: sortedUnique(documents.flatMap((document) => {
      if (id === 'content-kind') return [document.kind];
      if (id === 'editorial-state') return [document.editorialState];
      if (id === 'formal-state') return [document.formalState];
      if (id === 'publication-state') return [document.publicationState];
      if (id === 'representation') return document.representations;
      if (id === 'locale') return [document.locale];
      if (id === 'translation-state') return document.translationStates;
      return [];
    })).map((value) => ({ value, label: label(value) }))
  }));

  return {
    schemaVersion: DISCOVERY_SCHEMA,
    freezeDocument: DISCOVERY_FREEZE_DOCUMENT,
    documents,
    byContentId: new Map(documents.map((document) => [document.contentId, document])),
    filters,
    ranking: PAGEFIND_RANKING,
    fingerprint: `sha256:${sha256(documents)}`
  };
}

export function searchDiscoveryDocuments(documents, query) {
  const terms = normalizeSearchToken(query).split(' ').filter(Boolean);
  if (!terms.length) return [];
  return documents.filter((document) => {
    const haystack = normalizeSearchToken(document.searchText);
    return terms.every((term) => haystack.includes(term));
  }).sort((left, right) => {
    const exact = (document) => [document.title, document.contentId, ...document.identifiers, ...document.aliases]
      .map(normalizeSearchToken).includes(normalizeSearchToken(query));
    const delta = Number(exact(right)) - Number(exact(left));
    return delta || left.canonicalRoute.localeCompare(right.canonicalRoute, 'en');
  });
}

export function generateScaleSearchFixture(baseDocuments, count = 2_000) {
  if (!Array.isArray(baseDocuments) || baseDocuments.length === 0) throw new Error('scale fixture requires base documents');
  if (!Number.isInteger(count) || count < 3 || count > 2_000) throw new Error('scale fixture count must be an integer from 3 to 2000');
  const reserved = ['11A05', 'math.NT', 'urn:fmc:validation:m5-7:onto:parent-a'];
  const coverage = ['mapped', 'partially_mapped', 'unmapped', 'not_applicable', 'needs_review'];
  const documents = Array.from({ length: count }, (_, index) => {
    const ordinal = String(index + 1).padStart(6, '0');
    const template = baseDocuments[index % baseDocuments.length];
    const identifier = reserved[index] ?? `validation-scale-${ordinal}`;
    return {
      ...template,
      contentId: `validation:m57:${ordinal}`,
      canonicalRoute: `/validation/m5-7/scale/${ordinal}/`,
      title: `${template.title} — validation scale ${ordinal}`,
      identifiers: sortedUnique([...template.identifiers, identifier]),
      aliases: sortedUnique([...template.aliases, `scale-${ordinal}`]),
      coverageState: coverage[index % coverage.length],
      validationOnly: true,
      searchText: `${template.searchText} ${identifier} scale-${ordinal}`
    };
  });
  return {
    schemaVersion: 'p5-m5.7-scale-search-fixture/v1',
    fixtureId: SCALE_FIXTURE_ID,
    seed: SCALE_FIXTURE_SEED,
    count,
    documents,
    fingerprint: `sha256:${sha256(documents)}`,
    publicCoverage: false,
    productionIndexEligible: false
  };
}

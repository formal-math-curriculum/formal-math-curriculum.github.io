import assert from 'node:assert/strict';
import test from 'node:test';
import { LATEX_MATHML_RENDERER, renderMathMlTokens, tokenizeLatexMath } from '../src/lib/latex-mathml.mjs';

test('bounded renderer emits semantic MathML tokens for every governed formula', async () => {
  const publication = (await import('../.inputs/content/generated/m5-6/publication.json', { with: { type: 'json' } })).default;
  const blocks = publication.content.flatMap((entity) => entity.blocks ?? []);
  assert.equal(LATEX_MATHML_RENDERER, 'p5-latex-mathml-renderer/v1');
  assert.equal(blocks.length, 10);
  for (const block of blocks) {
    const tokens = tokenizeLatexMath(block.latex);
    const markup = renderMathMlTokens(block.latex);
    assert.ok(tokens.length > 0, block.block_id);
    assert.match(markup, /<(?:mi|mn|mo|mspace)\b/u, block.block_id);
    assert.doesNotMatch(markup, /<script|onerror=|javascript:/iu, block.block_id);
  }
});

test('unsupported or malformed LaTeX fails closed', () => {
  assert.throws(() => tokenizeLatexMath(''), /non-empty/u);
  assert.throws(() => tokenizeLatexMath('x^2'), /unsupported LaTeX character/u);
  assert.throws(() => tokenizeLatexMath('\\operatorname{bad-name}(x)'), /unsupported \\operatorname payload/u);
  assert.throws(() => tokenizeLatexMath('\\frac{1}{2}'), /unsupported LaTeX command/u);
});

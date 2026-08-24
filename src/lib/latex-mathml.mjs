export const LATEX_MATHML_RENDERER = 'p5-latex-mathml-renderer/v1';

const commands = Object.freeze({
  '\\cdot': { type: 'operator', value: '·' },
  '\\Rightarrow': { type: 'operator', value: '⇒' },
  '\\iff': { type: 'operator', value: '⇔' },
  '\\lor': { type: 'operator', value: '∨' },
  '\\quad': { type: 'space', value: '1em' },
  '\\qquad': { type: 'space', value: '2em' }
});

function commandAt(source, index) {
  return Object.keys(commands)
    .sort((left, right) => right.length - left.length)
    .find((command) => source.startsWith(command, index));
}

export function tokenizeLatexMath(source) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('LaTeX source must be non-empty');
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const character = source[index];
    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }
    if (source.startsWith('\\operatorname{', index)) {
      const start = index + '\\operatorname{'.length;
      const end = source.indexOf('}', start);
      if (end < 0) throw new Error('unterminated \\operatorname');
      const value = source.slice(start, end);
      if (!/^[A-Za-z][A-Za-z0-9]*$/u.test(value)) throw new Error('unsupported \\operatorname payload');
      tokens.push({ type: 'operator-name', value });
      index = end + 1;
      continue;
    }
    if (character === '\\') {
      const command = commandAt(source, index);
      if (!command) throw new Error(`unsupported LaTeX command at offset ${index}`);
      tokens.push(commands[command]);
      index += command.length;
      continue;
    }
    if (/\d/u.test(character)) {
      let end = index + 1;
      while (end < source.length && /\d/u.test(source[end])) end += 1;
      tokens.push({ type: 'number', value: source.slice(index, end) });
      index = end;
      continue;
    }
    if (/[A-Za-z]/u.test(character)) {
      tokens.push({ type: 'identifier', value: character });
      index += 1;
      continue;
    }
    if ('+-=(),.'.includes(character)) {
      tokens.push({ type: 'operator', value: character });
      index += 1;
      continue;
    }
    throw new Error(`unsupported LaTeX character ${JSON.stringify(character)} at offset ${index}`);
  }

  return tokens;
}

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function renderMathMlTokens(source) {
  return tokenizeLatexMath(source).map((token) => {
    const value = escapeXml(token.value);
    if (token.type === 'identifier') return `<mi>${value}</mi>`;
    if (token.type === 'number') return `<mn>${value}</mn>`;
    if (token.type === 'operator-name') return `<mi mathvariant="normal">${value}</mi>`;
    if (token.type === 'space') return `<mspace width="${value}"></mspace>`;
    return `<mo>${value}</mo>`;
  }).join('');
}

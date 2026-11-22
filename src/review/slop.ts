const patterns: [string, RegExp][] = [
  ['delve', /\bdelve(?:s|d|ing)?\b/gi], ['tapestry', /\btapestry\b/gi], ['landscape', /\b(?:ever-evolving|digital) landscape\b/gi],
  ['game-changer', /\bgame[ -]changer\b/gi], ['unlock', /\bunlock(?:ing)? (?:the )?(?:power|potential)\b/gi],
  ['revolutionize', /\brevolutioni[sz](?:e|es|ing)\b/gi], ['testament', /\b(?:a )?testament to\b/gi],
  ['not-just', /\bnot just\b[^.!?]*\bbut (?:also\b)?/gi], ['in-conclusion', /\bin conclusion\b/gi],
];
export function analyzeSlop(text: string): { grade: number | null; averageSentenceLength: number; hits: { id: string; count: number }[] } {
  const words = text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
  const sentences = (text.match(/[^.!?]+(?:[.!?]+|$)/g) ?? []).filter(s => /[a-z]/i.test(s)).length;
  const syllables = words.reduce((sum, word) => {
    const normalized = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
    return sum + Math.max(1, (normalized.match(/[aeiouy]+/g) ?? []).length);
  }, 0);
  return { grade: words.length && sentences ? Math.round((0.39 * words.length / sentences + 11.8 * syllables / words.length - 15.59) * 10) / 10 : null,
    averageSentenceLength: sentences ? Math.round(words.length / sentences * 10) / 10 : 0,
    hits: patterns.map(([id, re]) => ({ id, count: [...text.matchAll(re)].length })).filter(hit => hit.count > 0) };
}

import type { Criterion, GateResult, PostType, ScoreResult, Verdict } from '../types.ts';

export function totalScore(scores: ScoreResult[], rubric: Criterion[], postType: PostType): number | null {
  let earned = 0, possible = 0;
  for (const criterion of rubric) {
    if (criterion.appliesTo && !criterion.appliesTo.includes(postType)) continue;
    const score = scores.find(s => s.criterion === criterion.id)?.score;
    if (score === null || score === undefined) continue;
    const weight = criterion.weight ?? 1;
    earned += score * weight; possible += 2 * weight;
  }
  return possible ? earned / possible * 100 : null;
}

export function verdict(gates: GateResult[], total: number | null, threshold: number): Verdict {
  if (gates.some(g => !g.pass && g.unfixable)) return 'blocked';
  if (gates.some(g => !g.pass) || total === null || total < threshold) return 'revise';
  return 'pass';
}

export function validBlockers(value: unknown): boolean {
  return value === undefined || Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim().length > 0);
}

export function blockerTexts(value: unknown): string[] {
  if (value === undefined) return [];
  if (!validBlockers(value)) return ['Invalid blockers: expected an array of non-empty strings'];
  return value as string[];
}

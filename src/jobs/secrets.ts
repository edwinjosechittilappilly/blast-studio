import { keychainSet, type KeychainRunner } from '../keychain.ts';
import { UserError } from '../types.ts';

/** Store a supported provider credential without exposing it in an argument or response. */
export function saveSecret(key: unknown, value: unknown, options: { runner?: KeychainRunner; platform?: NodeJS.Platform } = {}): void {
  if (key !== 'GEMINI_API_KEY' && key !== 'OPENAI_API_KEY') throw new UserError('Unknown credential key');
  if (typeof value !== 'string' || !value || Buffer.byteLength(value) > 2000) throw new UserError('Invalid credential');
  keychainSet(key, value, options.runner, options.platform);
}

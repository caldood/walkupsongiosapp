import type { ID } from './types';

export type IdGenerator = () => ID;

export const newId: IdGenerator = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

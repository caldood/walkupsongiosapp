import { describe, expect, it } from 'vitest';
import { dropIndex } from './sortable';

describe('dropIndex', () => {
  const mids = [50, 150, 250]; // three other rows, 100px apart
  it('lands at the top when dragged above everything', () => expect(dropIndex(mids, 10)).toBe(0));
  it('lands between rows by comparing with midpoints', () => {
    expect(dropIndex(mids, 100)).toBe(1);
    expect(dropIndex(mids, 200)).toBe(2);
  });
  it('lands at the bottom when dragged below everything', () => expect(dropIndex(mids, 999)).toBe(3));
  it('handles a single-row list', () => expect(dropIndex([], 123)).toBe(0));
});

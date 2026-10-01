import { describe, expect, it } from 'vitest';
import { parseRosterText } from './roster';

describe('parseRosterText', () => {
  it('reads the number first or last, with common separators', () => {
    expect(parseRosterText('7 Brevan Sun\n#3 Luke\n12. Charlie Wu\n9, Ethan\nMax Rivera 5\nBen - 8')).toEqual([
      { number: '7', name: 'Brevan Sun' },
      { number: '3', name: 'Luke' },
      { number: '12', name: 'Charlie Wu' },
      { number: '9', name: 'Ethan' },
      { number: '5', name: 'Max Rivera' },
      { number: '8', name: 'Ben' },
    ]);
  });
  it('accepts names without numbers, blank lines and Windows line endings', () => {
    expect(parseRosterText('\nJack\r\n\r\n  Noah Diaz  \n')).toEqual([
      { number: '', name: 'Jack' },
      { number: '', name: 'Noah Diaz' },
    ]);
  });
  it('does not treat a lone number as a player', () => {
    expect(parseRosterText('7')).toEqual([{ number: '', name: '7' }]);
  });
});

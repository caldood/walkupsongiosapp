/**
 * Where a dragged row would land: the number of OTHER rows whose midpoint is above the dragged
 * row's centre. `midpoints` are the other rows' vertical midpoints in on-screen order.
 */
export function dropIndex(midpoints: number[], draggedCentre: number): number {
  let n = 0;
  for (const m of midpoints) if (m < draggedCentre) n++;
  return n;
}

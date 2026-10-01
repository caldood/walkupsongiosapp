import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';
import { dropIndex } from './sortable';

interface Drag {
  key: string;
  /** Pointer offset from the top of the row when the drag began. */
  grab: number;
}

/**
 * Touch-friendly drag-and-drop list. Uses Pointer Events (HTML5 drag-and-drop doesn't work with touch on
 * iOS Safari). Drag the ⠿ handle; the list reorders live, auto-scrolls near the edges, and the handle also
 * works from the keyboard (↑ / ↓).
 */
export function SortableList<T>({
  items,
  getKey,
  onMove,
  render,
  label,
  rowClassName = 'row player-row',
}: {
  items: T[];
  getKey(item: T): string;
  onMove(from: number, to: number): void;
  /** Draw a row's contents; place `handle` wherever the drag handle should appear. */
  render(item: T, index: number, handle: ReactNode): ReactNode;
  /** Accessible name for each item's handle. */
  label(item: T): string;
  rowClassName?: string;
}) {
  const rows = useRef(new Map<string, HTMLLIElement>());
  const [drag, setDrag] = useState<Drag | null>(null);
  const [translate, setTranslate] = useState(0);
  const translateRef = useRef(0);
  const lastY = useRef(0);
  const dragRef = useRef<Drag | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const cleanup = useRef<(() => void) | null>(null);

  /** Position the dragged row under the pointer, using the row's un-transformed layout position. */
  const place = useCallback(() => {
    const d = dragRef.current;
    const el = d && rows.current.get(d.key);
    if (!d || !el) return;
    const natural = el.getBoundingClientRect().top - translateRef.current;
    const next = lastY.current - d.grab - natural;
    translateRef.current = next;
    setTranslate(next);
  }, []);

  // After a live reorder the row's natural position changed: re-anchor it to the pointer.
  useLayoutEffect(() => {
    if (dragRef.current) place();
  }, [items, place]);

  useEffect(() => () => cleanup.current?.(), []);

  function begin(e: React.PointerEvent, key: string) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    const el = rows.current.get(key);
    if (!el) return;
    const d: Drag = { key, grab: e.clientY - el.getBoundingClientRect().top };
    dragRef.current = d;
    lastY.current = e.clientY;
    translateRef.current = 0;
    setTranslate(0);
    setDrag(d);

    const scroller = el.closest('.content') as HTMLElement | null;
    const move = (ev: PointerEvent) => {
      lastY.current = ev.clientY;
      const cur = dragRef.current;
      const dragged = cur && rows.current.get(cur.key);
      if (!cur || !dragged) return;
      const list = itemsRef.current;
      const from = list.findIndex((it) => getKey(it) === cur.key);
      const mids = list
        .filter((it) => getKey(it) !== cur.key)
        .map((it) => {
          const r = rows.current.get(getKey(it))?.getBoundingClientRect();
          return r ? r.top + r.height / 2 : 0;
        });
      const height = dragged.getBoundingClientRect().height;
      const to = dropIndex(mids, ev.clientY - cur.grab + height / 2);
      if (to !== from) onMoveRef.current(from, to);
      place();
    };
    const end = () => {
      cleanup.current?.();
    };
    // Auto-scroll while the pointer rests near the top/bottom edge of the scrolling area.
    const timer = window.setInterval(() => {
      if (!scroller) return;
      const r = scroller.getBoundingClientRect();
      const y = lastY.current;
      if (y < r.top + 70) scroller.scrollTop -= 14;
      else if (y > r.bottom - 70) scroller.scrollTop += 14;
      else return;
      place();
    }, 16);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    cleanup.current = () => {
      window.clearInterval(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      dragRef.current = null;
      translateRef.current = 0;
      setDrag(null);
      setTranslate(0);
      cleanup.current = null;
    };
  }

  return (
    <ol className="order sortable">
      {items.map((item, i) => {
        const key = getKey(item);
        const dragging = drag?.key === key;
        const handle = (
          <button
            type="button"
            className="drag-handle"
            aria-label={`Reorder ${label(item)}. Drag, or use the up and down arrow keys.`}
            onPointerDown={(e) => begin(e, key)}
            onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' && i > 0) {
                e.preventDefault();
                onMove(i, i - 1);
              } else if (e.key === 'ArrowDown' && i < items.length - 1) {
                e.preventDefault();
                onMove(i, i + 1);
              }
            }}
          >
            <Icon name="grip" size={22} />
          </button>
        );
        return (
          <li
            key={key}
            ref={(el) => {
              if (el) rows.current.set(key, el);
              else rows.current.delete(key);
            }}
            className={`${rowClassName} ${dragging ? 'dragging' : ''}`}
            style={dragging ? { transform: `translateY(${translate}px)` } : undefined}
          >
            {render(item, i, handle)}
          </li>
        );
      })}
    </ol>
  );
}

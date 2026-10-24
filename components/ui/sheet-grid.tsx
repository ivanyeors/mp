"use client";

/**
 * A spreadsheet-style grid of text cells: click / drag / shift-click to select a
 * range, click a column or row header to select all of it, arrows / Tab / Enter
 * to move, type to edit. Enter with several cells selected writes the value to
 * all of them. Copy and paste speak tab-separated text, so ranges move to and
 * from Google Sheets and Excel. The grid owns no values: every change goes out
 * through `onChange`.
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { stickyFirstColumnCellClassName, stickyFirstColumnHeadClassName } from "@/components/ui/table-sticky";
import { cn } from "@/lib/utils";

export type SheetColumn = { key: string; label: string; placeholder?: string; prefix?: string };
export type SheetRow = { id: string; label: string; header: ReactNode };
export type SheetEdit = { rowId: string; colKey: string; value: string };

type Cell = { r: number; c: number };
type Range = { anchor: Cell; focus: Cell };
/** `caret`: arrows move the caret (opened with Enter / F2 / double-click), not the selection. */
type Editing = { draft: string; caret: boolean };
type Drag = "cells" | "cols" | "rows" | null;

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

export function parseClipboardGrid(text: string): string[][] {
  return text
    .replace(/\r/g, "")
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => line.split("\t"));
}

export function SheetGrid({
  label,
  columns,
  rows,
  value,
  isDirty,
  onChange,
  leadHead,
  trailingHeads,
  renderTrailing,
}: {
  label: string;
  columns: SheetColumn[];
  rows: SheetRow[];
  value: (rowId: string, colKey: string) => string;
  isDirty?: (rowId: string, colKey: string) => boolean;
  onChange: (edits: SheetEdit[]) => void;
  leadHead: ReactNode;
  trailingHeads?: ReactNode;
  renderTrailing?: (rowId: string) => ReactNode;
}) {
  const uid = useId();
  const gridRef = useRef<HTMLTableElement>(null);
  const [sel, setSel] = useState<Range | null>(null);
  const [editing, setEditingState] = useState<Editing | null>(null);
  // Mirrors `editing` so the blur that follows a commit / cancel sees it already closed.
  const editRef = useRef<Editing | null>(null);
  const drag = useRef<Drag>(null);

  const setEditing = (e: Editing | null) => {
    editRef.current = e;
    setEditingState(e);
  };

  useEffect(() => {
    const up = () => {
      drag.current = null;
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const lastR = rows.length - 1;
  const lastC = columns.length - 1;
  const clamp = ({ r, c }: Cell): Cell => ({
    r: Math.max(0, Math.min(lastR, r)),
    c: Math.max(0, Math.min(lastC, c)),
  });

  const bounds = sel && {
    r0: Math.min(sel.anchor.r, sel.focus.r),
    r1: Math.max(sel.anchor.r, sel.focus.r),
    c0: Math.min(sel.anchor.c, sel.focus.c),
    c1: Math.max(sel.anchor.c, sel.focus.c),
  };
  const inSel = (r: number, c: number) =>
    !!bounds && r >= bounds.r0 && r <= bounds.r1 && c >= bounds.c0 && c <= bounds.c1;
  const selected = (): Cell[] => {
    if (!bounds) return [];
    const cells: Cell[] = [];
    for (let r = bounds.r0; r <= bounds.r1; r++) for (let c = bounds.c0; c <= bounds.c1; c++) cells.push({ r, c });
    return cells;
  };
  const cellCount = bounds ? (bounds.r1 - bounds.r0 + 1) * (bounds.c1 - bounds.c0 + 1) : 0;
  const isActive = (r: number, c: number) => sel?.anchor.r === r && sel.anchor.c === c;

  const valueAt = ({ r, c }: Cell) => value(rows[r].id, columns[c].key);
  const write = (cells: Cell[], v: (cell: Cell) => string) =>
    onChange(cells.map((cell) => ({ rowId: rows[cell.r].id, colKey: columns[cell.c].key, value: v(cell) })));

  const select = (anchor: Cell, focus: Cell = anchor) => setSel({ anchor: clamp(anchor), focus: clamp(focus) });

  /** The next cell, wrapping across rows for Tab; null past either end of the grid. */
  const step = (from: Cell, dr: number, dc: number, wrap: boolean): Cell | null => {
    let { r, c } = from;
    r += dr;
    c += dc;
    if (wrap && c > lastC) [r, c] = [r + 1, 0];
    if (wrap && c < 0) [r, c] = [r - 1, lastC];
    if (r < 0 || r > lastR) return null;
    return clamp({ r, c });
  };

  const startEdit = (draft: string, caret: boolean) => {
    if (sel) setEditing({ draft, caret });
  };

  /** Writes the open edit — to every selected cell when several are selected — then optionally moves. */
  const commit = (dr = 0, dc = 0, wrap = false, refocus = true) => {
    const e = editRef.current;
    if (!e || !sel) return;
    const many = cellCount > 1;
    write(many ? selected() : [sel.anchor], () => e.draft.trim());
    setEditing(null);
    if (!many && (dr || dc)) {
      const next = step(sel.anchor, dr, dc, wrap);
      if (next) select(next);
    }
    if (refocus) gridRef.current?.focus();
  };

  const cancel = () => {
    setEditing(null);
    gridRef.current?.focus();
  };

  const onGridKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    if (editRef.current || !sel || rows.length === 0) return;
    const mod = e.metaKey || e.ctrlKey;
    const arrow = ARROWS[e.key];
    if (arrow) {
      e.preventDefault();
      // Cmd/Ctrl jumps to the edge, as in a spreadsheet.
      const [dr, dc] = mod ? [arrow[0] * rows.length, arrow[1] * columns.length] : arrow;
      if (e.shiftKey) select(sel.anchor, { r: sel.focus.r + dr, c: sel.focus.c + dc });
      else select({ r: sel.anchor.r + dr, c: sel.anchor.c + dc });
      return;
    }
    if (e.key === "Tab") {
      const next = step(sel.anchor, 0, e.shiftKey ? -1 : 1, true);
      if (!next) return; // let focus leave the grid
      e.preventDefault();
      select(next);
      return;
    }
    if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      startEdit(valueAt(sel.anchor), true);
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      write(selected(), () => "");
      return;
    }
    if (e.key === "Escape") {
      select(sel.anchor);
      return;
    }
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      select({ r: 0, c: 0 }, { r: lastR, c: lastC });
      return;
    }
    if (mod && e.key.toLowerCase() === "d" && bounds) {
      e.preventDefault();
      write(selected(), ({ c }) => valueAt({ r: bounds.r0, c }));
      return;
    }
    if (e.key.length === 1 && !mod && !e.altKey) {
      e.preventDefault();
      startEdit(e.key, false);
    }
  };

  const onEditKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      commit(e.shiftKey ? -1 : 1, 0);
    } else if (e.key === "Tab") {
      e.preventDefault();
      commit(0, e.shiftKey ? -1 : 1, true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if (ARROWS[e.key] && !editRef.current?.caret) {
      e.preventDefault();
      commit(...ARROWS[e.key]);
    }
  };

  const onCopy = (e: ClipboardEvent<HTMLTableElement>) => {
    if (editRef.current || !bounds) return;
    e.preventDefault();
    const lines: string[] = [];
    for (let r = bounds.r0; r <= bounds.r1; r++) {
      const cells: string[] = [];
      for (let c = bounds.c0; c <= bounds.c1; c++) cells.push(valueAt({ r, c }));
      lines.push(cells.join("\t"));
    }
    e.clipboardData.setData("text/plain", lines.join("\n"));
  };

  const onPaste = (e: ClipboardEvent<HTMLTableElement>) => {
    if (editRef.current || !bounds) return;
    e.preventDefault();
    const grid = parseClipboardGrid(e.clipboardData.getData("text/plain"));
    if (grid.length === 1 && grid[0].length === 1) {
      write(selected(), () => grid[0][0].trim());
      return;
    }
    const cells: Cell[] = [];
    grid.forEach((line, dr) =>
      line.forEach((_, dc) => {
        const cell = { r: bounds.r0 + dr, c: bounds.c0 + dc };
        if (cell.r <= lastR && cell.c <= lastC) cells.push(cell);
      }),
    );
    write(cells, ({ r, c }) => grid[r - bounds.r0][c - bounds.c0].trim());
    if (cells.length) select(cells[0], cells[cells.length - 1]);
  };

  const cellId = (r: number, c: number) => `${uid}-${r}-${c}`;

  return (
    <div className="space-y-1">
      <div className="overflow-x-auto rounded-md border">
        <table
          ref={gridRef}
          role="grid"
          aria-label={label}
          aria-multiselectable
          aria-activedescendant={sel ? cellId(sel.anchor.r, sel.anchor.c) : undefined}
          tabIndex={0}
          className="w-full border-collapse text-sm select-none focus:outline-none"
          onKeyDown={onGridKeyDown}
          onCopy={onCopy}
          onPaste={onPaste}
          onFocus={() => setSel((s) => s ?? (rows.length ? { anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } } : null))}
        >
          <thead>
            <tr className="bg-muted/50">
              <th
                className={cn(stickyFirstColumnHeadClassName, "bg-muted border-b px-3 py-2 text-left font-medium text-muted-foreground cursor-pointer")}
                onMouseDown={() => select({ r: 0, c: 0 }, { r: lastR, c: lastC })}
              >
                {leadHead}
              </th>
              {columns.map((col, c) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    "border-b border-l px-2 py-2 text-right font-medium text-muted-foreground cursor-pointer whitespace-nowrap hover:bg-muted",
                    bounds && bounds.r0 === 0 && bounds.r1 === lastR && c >= bounds.c0 && c <= bounds.c1 && "bg-primary/15 text-foreground",
                  )}
                  onMouseDown={(e) => {
                    const fromC = e.shiftKey && sel ? sel.anchor.c : c;
                    select({ r: 0, c: fromC }, { r: lastR, c });
                    drag.current = "cols";
                  }}
                  onMouseEnter={() => {
                    if (drag.current === "cols" && sel) select({ r: 0, c: sel.anchor.c }, { r: lastR, c });
                  }}
                >
                  {col.label}
                </th>
              ))}
              {trailingHeads}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={row.id} className="border-b last:border-b-0">
                <th
                  scope="row"
                  className={cn(
                    stickyFirstColumnCellClassName,
                    "px-3 py-1.5 text-left font-medium cursor-pointer hover:bg-muted/50",
                    bounds && bounds.c0 === 0 && bounds.c1 === lastC && r >= bounds.r0 && r <= bounds.r1 && "bg-primary/15",
                  )}
                  onMouseDown={(e) => {
                    const fromR = e.shiftKey && sel ? sel.anchor.r : r;
                    select({ r: fromR, c: 0 }, { r, c: lastC });
                    drag.current = "rows";
                  }}
                  onMouseEnter={() => {
                    if (drag.current === "rows" && sel) select({ r: sel.anchor.r, c: 0 }, { r, c: lastC });
                  }}
                >
                  {row.header}
                </th>
                {columns.map((col, c) => {
                  const active = isActive(r, c);
                  const v = value(row.id, col.key);
                  return (
                    <td
                      key={col.key}
                      id={cellId(r, c)}
                      role="gridcell"
                      aria-selected={inSel(r, c)}
                      aria-label={`${row.label} ${col.label}`}
                      className={cn(
                        "relative h-9 min-w-16 border-l px-2 text-right tabular-nums cursor-cell",
                        inSel(r, c) && "bg-primary/10",
                        active && "outline outline-2 -outline-offset-2 outline-primary",
                        isDirty?.(row.id, col.key) && "text-amber-600 dark:text-amber-400 font-semibold",
                      )}
                      onMouseDown={(e) => {
                        if (e.shiftKey && sel) select(sel.anchor, { r, c });
                        else select({ r, c });
                        drag.current = "cells";
                      }}
                      onMouseEnter={() => {
                        if (drag.current === "cells" && sel) select(sel.anchor, { r, c });
                      }}
                      onDoubleClick={() => startEdit(v, true)}
                    >
                      {active && editing ? (
                        <input
                          autoFocus
                          inputMode="decimal"
                          aria-label={`${row.label} ${col.label}`}
                          className="absolute inset-0 w-full bg-background px-2 text-right tabular-nums outline outline-2 -outline-offset-2 outline-primary"
                          value={editing.draft}
                          onChange={(e) => setEditing({ ...editing, draft: e.target.value })}
                          onFocus={(e) => {
                            const end = e.currentTarget.value.length;
                            e.currentTarget.setSelectionRange(end, end);
                          }}
                          onKeyDown={onEditKeyDown}
                          onBlur={() => commit(0, 0, false, false)}
                        />
                      ) : v === "" ? (
                        <span className="text-muted-foreground">{col.placeholder ?? ""}</span>
                      ) : (
                        `${col.prefix ?? ""}${v}`
                      )}
                    </td>
                  );
                })}
                {renderTrailing?.(row.id)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {cellCount > 1
          ? `${cellCount} cells selected — type a value and press Enter to fill them all, or paste.`
          : "Click a header to select a whole column · drag or Shift-click for a range · arrows / Tab / Enter to move · type to edit · ⌘C / ⌘V with Sheets or Excel · ⌘D fills down."}
      </p>
    </div>
  );
}

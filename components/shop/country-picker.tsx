"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { countryName } from "@/lib/shipping/countries";
import { countryFlag, groupCountries } from "@/lib/shipping/country-picker";
import { cn } from "@/lib/utils";

export function CountryPicker({
  id,
  value,
  codes,
  onChange,
  invalid,
}: {
  id?: string;
  value: string;
  codes: string[];
  onChange: (code: string) => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => groupCountries(codes, query), [codes, query]);
  const flat = useMemo(() => groups.flatMap((g) => g.codes), [groups]);
  const indexOf = useMemo(() => new Map(flat.map((code, i) => [code, i])), [flat]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const choose = (code: string) => {
    onChange(code);
    setOpen(false);
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setQuery("");
      const all = groupCountries(codes).flatMap((g) => g.codes);
      setActive(Math.max(0, all.indexOf(value)));
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={invalid || undefined}
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 max-md:min-h-11 md:text-sm dark:bg-input/30",
            invalid && "border-destructive",
          )}
        >
          <span aria-hidden className="text-lg leading-none">
            {countryFlag(value)}
          </span>
          <span className="min-w-0 flex-1 truncate">{value ? countryName(value) : "Select country"}</span>
          <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 opacity-50" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(flat.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const code = flat[active];
                if (code) choose(code);
              }
            }}
            placeholder="Search country"
            aria-label="Search country"
            aria-controls={listId}
            aria-activedescendant={flat[active] ? `${listId}-${flat[active]}` : undefined}
            className="h-11 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground md:h-10 md:text-sm"
          />
        </div>
        <div ref={listRef} id={listId} role="listbox" className="max-h-72 overflow-y-auto overscroll-contain p-1">
          {flat.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No country matches “{query}”.</p>
          ) : (
            groups.map((group) => (
              <div key={group.label ?? "home"} role="group" aria-label={group.label ?? undefined}>
                {group.label ? (
                  <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">{group.label}</p>
                ) : null}
                {group.codes.map((code) => {
                  const i = indexOf.get(code) ?? 0;
                  const selected = code === value;
                  return (
                    <div
                      key={code}
                      id={`${listId}-${code}`}
                      role="option"
                      aria-selected={selected}
                      data-index={i}
                      onPointerMove={() => setActive(i)}
                      onClick={() => choose(code)}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm max-md:min-h-11",
                        i === active && "bg-accent text-accent-foreground",
                      )}
                    >
                      <span aria-hidden className="text-lg leading-none">
                        {countryFlag(code)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{countryName(code)}</span>
                      {selected ? <Check className="size-4 shrink-0" aria-hidden /> : null}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { searchTickers } from "@/lib/idx/tickers";

export function SearchBar({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const suggestions = useMemo(
    () => (query ? searchTickers(query, 8) : []),
    [query]
  );

  function goTo(code: string) {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    router.push(`/saham/${trimmed}`);
  }

  return (
    <div className="relative w-full max-w-md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          goTo(query);
        }}
      >
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Cari kode saham, mis. BBCA"
          className="w-full rounded-lg border border-black/10 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none ring-blue-500 placeholder:text-zinc-400 focus:ring-2 dark:border-white/10 dark:bg-white/5 dark:text-zinc-50"
        />
      </form>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-black/10 bg-white shadow-lg dark:border-white/10 dark:bg-zinc-900">
          {suggestions.map((t) => (
            <li key={t.code}>
              <button
                type="button"
                onMouseDown={() => goTo(t.code)}
                className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-white/10"
              >
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  {t.code}
                </span>
                <span className="truncate pl-3 text-xs text-zinc-500">
                  {t.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

interface PaginationProps {
  page: number;
  hasMore: boolean;
  pageSize: number;
  itemsThisPage: number;
}

export function Pagination({
  page,
  hasMore,
  pageSize,
  itemsThisPage,
}: PaginationProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function buildUrl(newPage: number): string {
    const params = new URLSearchParams(searchParams);
    if (newPage <= 1) params.delete("page");
    else params.set("page", String(newPage));
    const q = params.toString();
    return q ? `${pathname}?${q}` : pathname;
  }

  if (page <= 1 && !hasMore) return null; // single page, no nav needed

  const from = (page - 1) * pageSize + 1;
  const to = (page - 1) * pageSize + itemsThisPage;

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm">
      <div className="text-neutral-400">
        Mostrando <strong className="text-white">{from}-{to}</strong>
        {" "}· Página <strong className="text-white">{page}</strong>
      </div>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            href={buildUrl(page - 1)}
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800"
          >
            ← Anterior
          </Link>
        ) : (
          <span className="rounded border border-neutral-900 bg-neutral-950 px-3 py-1.5 text-neutral-700">
            ← Anterior
          </span>
        )}
        {hasMore ? (
          <Link
            href={buildUrl(page + 1)}
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800"
          >
            Siguiente →
          </Link>
        ) : (
          <span className="rounded border border-neutral-900 bg-neutral-950 px-3 py-1.5 text-neutral-700">
            Siguiente →
          </span>
        )}
      </div>
    </div>
  );
}

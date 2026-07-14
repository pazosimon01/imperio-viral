export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="h-4 w-32 rounded bg-neutral-900" />
      <div className="flex items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-950 p-5">
        <div className="h-16 w-16 animate-pulse rounded-full bg-neutral-800" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-40 animate-pulse rounded bg-neutral-800" />
          <div className="h-3 w-24 animate-pulse rounded bg-neutral-900" />
        </div>
      </div>
      <div className="flex items-center justify-center gap-2 py-2 text-sm text-neutral-400">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" />
        Consultando Instagram en vivo…
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[4/5] animate-pulse rounded-xl bg-neutral-900"
          />
        ))}
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="h-4 w-24 rounded bg-neutral-900" />
      <div className="flex items-center justify-center gap-2 py-2 text-sm text-neutral-400">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" />
        Analizando los perfiles en vivo…
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 15 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[4/5] animate-pulse rounded-xl bg-neutral-900"
          />
        ))}
      </div>
    </div>
  );
}

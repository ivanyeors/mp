export default function ShopLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Search/filter bar skeleton */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-10 w-64 animate-pulse rounded-md bg-muted" />
        <div className="flex gap-2">
          <div className="h-10 w-32 animate-pulse rounded-md bg-muted" />
          <div className="h-10 w-32 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
      {/* Product grid skeleton */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3">
            <div className="aspect-square w-full animate-pulse rounded-lg bg-muted" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

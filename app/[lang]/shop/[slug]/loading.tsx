export default function ProductDetailLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Image gallery skeleton */}
        <div className="aspect-square w-full animate-pulse rounded-lg bg-muted" />
        {/* Product info skeleton */}
        <div className="flex flex-col gap-4">
          <div className="h-8 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-6 w-1/4 animate-pulse rounded bg-muted" />
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-12 w-48 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    </div>
  );
}

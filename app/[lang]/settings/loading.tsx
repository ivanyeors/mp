export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header skeleton */}
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      {/* Content skeleton */}
      <div className="flex flex-col gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 w-full animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}

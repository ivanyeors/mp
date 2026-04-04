import Link from "next/link";

export default function ProductNotFound() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-xl font-semibold">Product Not Found</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        This product does not exist or is no longer available.
      </p>
      <Link
        href="/shop"
        className="mt-2 rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Browse Products
      </Link>
    </div>
  );
}

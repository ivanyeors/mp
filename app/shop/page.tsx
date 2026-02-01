import Link from "next/link";

export default function ShopPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Shop</h1>
        <p className="text-muted-foreground leading-relaxed">
          Explore Mpillow products and accessories.
        </p>
        <div className="pt-2">
          <Link href="/" className="underline underline-offset-4">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}


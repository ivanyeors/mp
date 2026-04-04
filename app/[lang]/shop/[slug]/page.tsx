import { notFound } from "next/navigation";
import { getProductBySlug, getProducts } from "@/lib/ecommerce/products";
import { ProductDetailClient } from "./product-detail-client";
import type { Product } from "@/lib/types/ecommerce";

interface Props {
  params: Promise<{ lang: string; slug: string }>;
}

export default async function ProductDetailPage({ params }: Props) {
  const { lang, slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product || product.status !== "active") {
    notFound();
  }

  // Fetch related products from the same category
  let relatedProducts: Product[] = [];
  if (product.category_id) {
    const { products } = await getProducts({
      status: "active",
      category_id: product.category_id,
      limit: 5,
    });
    relatedProducts = products
      .filter((p) => p.id !== product.id)
      .slice(0, 4);
  }

  return (
    <ProductDetailClient
      product={product}
      relatedProducts={relatedProducts}
      lang={lang}
    />
  );
}

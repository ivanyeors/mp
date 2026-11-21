import { revalidateTag } from "next/cache";

export function invalidateTag(tag: string): void {
  revalidateTag(tag, { expire: 0 });
}

export function invalidateTags(...tags: string[]): void {
  for (const tag of tags) invalidateTag(tag);
}

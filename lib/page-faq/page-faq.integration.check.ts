import assert from "node:assert/strict";
import { getFaqCategories, getFaqItems } from "@/lib/faq";
import { getPageFaq, isValidSurfaceKey, productSurfaceKey } from "@/lib/page-faq";

async function main() {
  assert.equal(await getPageFaq("nope", "en-US"), null);

  const home = await getPageFaq("home", "en-US");
  assert.ok(home);
  assert.ok(home!.items.length >= 3);
  assert.ok(home!.items.every((i) => i.question && i.answer));
  const positions = home!.items.map((i) => i.position);
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));

  const homeZh = await getPageFaq("home", "zh-CN");
  assert.notEqual(homeZh!.items[0].question, home!.items[0].question);

  const basicId = "84c85b30-c6ee-40fc-9cbe-1a5e66dc6c99";
  const pdp = await getPageFaq(productSurfaceKey(basicId), "en-US");
  assert.ok(pdp!.items.length >= 3);

  assert.ok((await getPageFaq("mp-config", "en-US"))!.items.length >= 3);
  assert.ok((await getPageFaq("mbolster-config", "en-US"))!.items.length >= 3);

  const cats = await getFaqCategories({ locale: "en-US" });
  const items = await getFaqItems({ locale: "en-US" });
  assert.equal(cats.length, 5);
  assert.equal(items.length, 32);

  assert.equal(isValidSurfaceKey("home"), true);
  assert.equal(isValidSurfaceKey("shop"), false);

  console.log("page-faq integration ok", {
    homeItems: home!.items.length,
    pdpItems: pdp!.items.length,
    globalCats: cats.length,
    globalItems: items.length,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

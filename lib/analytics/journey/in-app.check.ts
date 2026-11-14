/**
 * In-app browser detection at Visit start.
 * Run: npx tsx lib/analytics/journey/in-app.check.ts
 */
import assert from "node:assert/strict";
import { entryAppFromUserAgent, isEntryApp } from "./in-app";

const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

assert.equal(entryAppFromUserAgent(`${IOS} Instagram 355.0.0.31.72 (iPhone15,2; iOS 18_1; en_SG)`), "instagram");
assert.equal(entryAppFromUserAgent(`${IOS} [FBAN/FBIOS;FBAV/487.0.0.52.75;FBBV/1;FBDV/iPhone15,2]`), "facebook");
// Instagram's shell also says FBAN: Instagram wins
assert.equal(entryAppFromUserAgent(`${IOS} Instagram 355.0 [FBAN/FBIOS;FBAV/1]`), "instagram");
assert.equal(entryAppFromUserAgent(`${IOS} Barcelona 355.0.0 (iPhone15,2)`), "threads");
assert.equal(entryAppFromUserAgent(`${IOS} musical_ly_37.2.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en`), "tiktok");
assert.equal(
  entryAppFromUserAgent(
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36 trill_370205 BytedanceWebview/d8a21c6",
  ),
  "tiktok",
);
assert.equal(entryAppFromUserAgent(`${IOS} discover/8.60 (iPhone; iOS 18.1) XiaoHongShu/8.60`), "xiaohongshu");
assert.equal(entryAppFromUserAgent(`${IOS} MicroMessenger/8.0.50(0x18003237) NetType/WIFI`), "wechat");

// An ordinary browser is no app
assert.equal(entryAppFromUserAgent(`${IOS.replace("Mobile/15E148", "Version/18.1 Mobile/15E148 Safari/604.1")}`), null);
assert.equal(
  entryAppFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36"),
  null,
);
assert.equal(entryAppFromUserAgent(""), null);
assert.equal(entryAppFromUserAgent(null), null);

assert.equal(isEntryApp("tiktok"), true);
assert.equal(isEntryApp("TikTok"), false);

console.log("in-app.check.ts: ok");

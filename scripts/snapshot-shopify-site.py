#!/usr/bin/env python3
"""Record what the old Shopify site at www.mpillow.com says, page by page, before
www.mpillow.com moves to this site (ADR 0029, the cutover).

    python3 scripts/snapshot-shopify-site.py docs/cutover/shopify-snapshot-2026-11-18.json

The agency's plan compares each old page with its new one after the switch, and
once DNS moves the old pages are no longer at these addresses. For every address
in the approved redirect map (lib/__fixtures__/shopify-redirect-map.json) and
every address in Shopify's own sitemaps, this keeps the status (and where Shopify
itself redirects), the title, meta description, canonical, robots, social tags
and headings. For each blog post the map sends to the home page, it also keeps
the article itself (date, image and body HTML), so it can still be brought over
as a real post after the old site is gone.

Shopify rate-limits a crawl (429), blog posts first. Run it again with the same
output file and it keeps every page already recorded and fetches only the ones
Shopify refused.

Only GET requests; changes nothing. Behind a proxy, set SSL_CERT_FILE to its CA
bundle. Standard library only.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit

ORIGIN = "https://www.mpillow.com"
ROOT = Path(__file__).resolve().parent.parent
MAP = json.loads((ROOT / "lib/__fixtures__/shopify-redirect-map.json").read_text())
UA = "Mozilla/5.0 (compatible; mp-site-snapshot/1.0)"
SITEMAP_NS = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
PAUSE = 4.0  # seconds each worker waits between pages
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # noqa: D401 - keep the 3xx
        return None


OPENER = urllib.request.build_opener(NoRedirect)


def fetch(url: str) -> tuple[int, str | None, str]:
    """Status, Location and body, without following a redirect."""
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en"})
    for attempt in range(6):
        try:
            with OPENER.open(request, timeout=30) as res:
                return res.status, None, res.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as error:
            # Shopify rate-limits a fast crawl: wait as long as it asks, then try again.
            if error.code == 429 and attempt < 5:
                wait = min(float(error.headers.get("Retry-After") or 0) or 5 * (attempt + 1), 60)
                print(f"  429 on {url}, waiting {wait:.0f}s", file=sys.stderr, flush=True)
                time.sleep(wait)
                continue
            return error.code, error.headers.get("Location"), error.read().decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError):
            if attempt == 5:
                raise
            time.sleep(2)
    raise RuntimeError("unreachable")


class Page(HTMLParser):
    """The parts of a page a search engine reads, and the article body if there is one."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.meta: dict[str, str] = {}
        self.canonical: str | None = None
        self.title = ""
        self.headings: dict[str, list[str]] = {"h1": [], "h2": [], "h3": []}
        self.time: str | None = None
        self.prose: list[str] = []
        self._in_title = False
        self._heading: str | None = None
        self._text: list[str] = []
        self._in_time = False
        self._prose_depth = 0  # >0 while inside div.prose
        self._prose_done = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if self._prose_depth:
            if tag not in VOID:
                self._prose_depth += 1
            self.prose.append(self.get_starttag_text() or "")
        elif tag == "div" and "prose" in (a.get("class") or "").split() and not self._prose_done:
            self._prose_depth = 1
        if tag == "title":
            self._in_title = True
        elif tag == "meta":
            key = a.get("name") or a.get("property")
            if key and key not in self.meta and a.get("content") is not None:
                self.meta[key] = a["content"]
        elif tag == "link" and a.get("rel") == "canonical":
            self.canonical = a.get("href")
        elif tag in self.headings:
            self._heading, self._text = tag, []
        elif tag == "time" and self.time is None:
            self._in_time = True

    def handle_endtag(self, tag):
        if self._prose_depth:
            self._prose_depth -= 1
            if self._prose_depth == 0:
                self._prose_done = True
            else:
                self.prose.append(f"</{tag}>")
        if tag == "title":
            self._in_title = False
        elif tag == self._heading:
            text = " ".join("".join(self._text).split())
            if text:
                self.headings[tag].append(text)
            self._heading = None
        elif tag == "time":
            self._in_time = False

    def handle_data(self, data):
        if self._prose_depth:
            self.prose.append(data.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
        if self._in_title:
            self.title += data
        if self._heading:
            self._text.append(data)
        if self._in_time:
            self.time = (self.time or "") + data.strip()


def sitemap_paths() -> list[str]:
    """Every address in Shopify's sitemaps, as a path."""
    status, _, body = fetch(f"{ORIGIN}/sitemap.xml")
    if status != 200:
        return []
    paths: list[str] = []
    for loc in ET.fromstring(body).findall("s:sitemap/s:loc", SITEMAP_NS):
        s, _, child = fetch(loc.text.strip())
        if s != 200:
            continue
        for url in ET.fromstring(child).findall("s:url/s:loc", SITEMAP_NS):
            parts = urlsplit(url.text.strip())
            if parts.netloc.endswith("mpillow.com"):
                paths.append(parts.path + (f"?{parts.query}" if parts.query else ""))
    return paths


def snapshot(path: str, keep_article: bool) -> dict:
    hops = []
    url = urljoin(ORIGIN, path)
    status, location, body = fetch(url)
    # Follow Shopify's own redirects (an old handle it already moved) up to three times.
    while location and len(hops) < 3:
        url = urljoin(url, location)
        if urlsplit(url).netloc != urlsplit(ORIGIN).netloc:
            # Off the site (Shopify's account login): keep where, not its one-time query.
            parts = urlsplit(url)
            hops.append({"status": status, "to": f"{parts.scheme}://{parts.netloc}{parts.path}"})
            break
        hops.append({"status": status, "to": location})
        status, location, body = fetch(url)
    page = Page()
    page.feed(body)
    m = page.meta
    entry = {
        "path": path,
        "status": status,
        "redirects": hops or None,
        "title": " ".join(page.title.split()) or None,
        "description": m.get("description"),
        "canonical": page.canonical,
        "robots": m.get("robots"),
        "ogTitle": m.get("og:title"),
        "ogDescription": m.get("og:description"),
        "ogImage": m.get("og:image"),
        "h1": page.headings["h1"],
        "h2": page.headings["h2"],
        "h3": page.headings["h3"],
    }
    if page.prose:
        text = HTMLParser()
        words: list[str] = []
        text.handle_data = lambda d: words.extend(d.split())  # type: ignore[method-assign]
        text.feed("".join(page.prose))
        entry["published"] = page.time
        entry["words"] = len(words)
        if keep_article:
            entry["articleHtml"] = "".join(page.prose).strip()
    return entry


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("Usage: python3 scripts/snapshot-shopify-site.py <out.json>")
    out = Path(sys.argv[1])

    destination = {row["old"]: row for row in MAP}
    from_sitemap = sitemap_paths()
    paths = list(dict.fromkeys([row["old"] for row in MAP] + from_sitemap))
    to_home = {
        row["old"]
        for row in MAP
        if row["to"] == "/en-US" and row["old"].startswith("/blogs/") and row["old"].count("/") == 3
    }

    # A re-run keeps what the last one recorded and asks only for what Shopify refused.
    kept: dict[str, dict] = {}
    if out.exists():
        kept = {p["path"]: p for p in json.loads(out.read_text())["pages"] if p["status"] != 429}
    print(
        f"{len(paths)} addresses ({len(from_sitemap)} in Shopify's sitemaps), {len(kept)} already recorded",
        file=sys.stderr,
        flush=True,
    )

    def one(i_path: tuple[int, str]) -> dict:
        i, path = i_path
        if path in kept:
            return kept[path]
        page = snapshot(path, path in to_home)
        print(f"{i + 1}/{len(paths)} {page['status']} {path}", file=sys.stderr, flush=True)
        time.sleep(PAUSE)  # a steady pace, under Shopify's rate limit
        return page

    with ThreadPoolExecutor(max_workers=1) as pool:
        pages = list(pool.map(one, enumerate(paths)))

    for page in pages:
        row = destination.get(page["path"])
        page["inMap"] = row is not None
        page["mapTo"] = row["to"] if row else None
        page["inSitemap"] = page["path"] in from_sitemap

    result = {
        "source": ORIGIN,
        "takenAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "why": "The old Shopify site before www.mpillow.com moved to this site (ADR 0029). "
        "scripts/snapshot-shopify-site.py wrote this.",
        "counts": {
            "pages": len(pages),
            "inMap": sum(p["inMap"] for p in pages),
            "inSitemapNotInMap": sum(p["inSitemap"] and not p["inMap"] for p in pages),
            "articlesKept": sum("articleHtml" in p for p in pages),
            "byStatus": {
                str(s): sum(p["status"] == s for p in pages) for s in sorted({p["status"] for p in pages})
            },
        },
        "pages": pages,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps(result["counts"], indent=1))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build-time author portrait catalog for the typing Typist sub-game.

Reads unique person-like names from a gtypist .typ file, resolves them through
Wikidata (humans only, conservative exact match, prefer computing occupations)
and Wikimedia Commons (CC BY, CC BY-SA, CC0, or public domain only), then writes
resized WebP stills, catalog.json and CREDITS.md.

The .typ file is not stored in the repo. Pass --typ PATH.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from pathlib import Path

from PIL import Image

UA = "NESTypingPortraits/1.0 (https://games.itio.space/never/; educational game build script)"
WD = "https://www.wikidata.org/w/api.php"
COMMONS = "https://commons.wikimedia.org/w/api.php"
CACHE_DEFAULT = Path("/tmp/portrait-cache")
MAX_EDGE = 300
WEBP_QUALITY = 74

# P31 values that mean "not a real person to show a likeness of".
NON_HUMAN = {
    "Q15632617",  # fictional human
    "Q95074",  # fictional character
    "Q21070568",
    "Q15773347",  # film character
    "Q15711870",  # animated character
    "Q3658341",  # literary character
    "Q4167410",  # Wikimedia disambiguation page
    "Q13406463",  # Wikimedia list article
    "Q4167836",  # Wikimedia category
    "Q1656682",  # event
    "Q11424",  # film
    "Q7725634",  # literary work
    "Q47461344",  # written work
    "Q35127",  # website
    "Q34770",  # language
}
HUMAN = "Q5"

# Occupations / fields that mark a computing-related person when names collide.
COMPUTING = {
    "Q82594",  # computer scientist
    "Q548450",  # programmer
    "Q1709010",  # software engineer
    "Q183888",  # software developer
    "Q188829",  # computer engineer
    "Q16031530",  # software architect
    "Q11303721",  # hacker
    "Q107212324",  # open-source contributor
    "Q2498887",
    "Q5157565",
    "Q2518208",  # informatician
    "Q1429017",
    "Q5322166",
    "Q627325",
    "Q5482740",  # software tester? optional
    "Q125641728",
    "Q15994173",  # computing pioneer? 
    "Q3621491",  # architect of computers?
}
COMPUTING_WORDS = re.compile(
    r"\b(computer|computing|software|programmer|programming|informatic|hacker|"
    r"open-?source|video game|game designer|internet|cryptograph)\b",
    re.I,
)

LICENSE_OK = re.compile(
    r"(cc0|cc[-\s]?zero|public\s*domain|\bpd\b|pdm|pd[-_/ ]|"
    r"cc[-\s]?by(?![-\s]?nc)(?![-\s]?nd)(?:[-\s]?sa)?)",
    re.I,
)
LICENSE_BAD = re.compile(r"fair\s*use|[-\s]nc(?:[-\s]|$)|[-\s]nd(?:[-\s]|$)|noncommercial", re.I)

PARTICLES = set("and or of the de van von da del jr jr. sr sr. ii iii".split())
MULTI_AUTHOR = re.compile(r"\s+&\s+|\s+and\s+", re.I)


def get(url: str, cache: Path | None = None, retries: int = 8) -> bytes:
    import urllib.error
    key = None
    if cache is not None:
        cache.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha256(url.encode()).hexdigest()[:24]
        slug = re.sub(r"[^A-Za-z0-9._-]+", "_", url)
        key = cache / f"{slug[:80]}_{digest}"
        if key.exists() and key.stat().st_size > 2:
            return key.read_bytes()
        # Legacy truncated names are unique only when the sanitized URL fits in 180 chars.
        legacy = cache / slug[:180]
        if len(slug) <= 180 and legacy.exists() and legacy.stat().st_size > 2:
            return legacy.read_bytes()
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read()
            if key is not None:
                key.write_bytes(data)
            return data
        except urllib.error.HTTPError as e:
            last = e
            wait = 4 * (i + 1)
            if e.code == 429:
                ra = e.headers.get("Retry-After") if e.headers else None
                if ra and ra.isdigit():
                    wait = max(wait, int(ra) + 1)
                wait = min(wait, 90)
                print(f"  429 backing off {wait}s", flush=True)
            elif e.code in {500, 502, 503, 504}:
                wait = 2 * (i + 1)
            else:
                # 404 etc: don't hammer
                if i >= 2:
                    raise
            time.sleep(wait)
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(0.8 * (i + 1))
    raise last  # type: ignore[misc]


def api(base: str, params: dict, cache: Path) -> dict:
    params = {**params, "format": "json"}
    url = base + "?" + urllib.parse.urlencode(params)
    return json.loads(get(url, cache))


def norm_space(s: str) -> str:
    s = s.replace("\u2018", "'").replace("\u2019", "'").replace("\u201c", '"').replace("\u201d", '"')
    return re.sub(r"\s+", " ", s).strip()


def looks_like_person_name(raw: str) -> bool:
    s = norm_space(raw)
    if not s or len(s) > 80:
        return False
    if re.search(r"[?!]", s):
        return False
    words = s.split()
    if not (1 <= len(words) <= 7):
        return False
    caps = 0
    for w in words:
        bare = re.sub(r'^[(\["\']+|[)\]"\',]+$', "", w)
        if not bare:
            continue
        if bare.lower() in PARTICLES or bare == "&":
            continue
        if re.match(r"^[A-Z](?:[A-Za-z'.-]*|\.?)$", bare) or re.match(r"^[A-Z](?:\.[A-Z])+\.?$", bare):
            caps += 1
            continue
        return False
    return caps >= 1


def author_from_instruction(instruction: str) -> str | None:
    rest = norm_space(re.sub(r"^\s*\[\d+\]\s*", "", instruction))
    if not rest:
        return None
    m = re.match(r"^([^,]+),\s*(.*)$", rest)
    name = (m.group(1) if m else rest).strip()
    return name if looks_like_person_name(name) else None


def fold_name(s: str) -> str:
    s = norm_space(s).lower()
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
    s = s.replace(".", " ")
    s = re.sub(r"[\"'`]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def slug(s: str) -> str:
    s = fold_name(s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "author"


def extract_authors(typ: Path) -> Counter:
    names: list[str] = []
    for line in typ.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith("I:"):
            a = author_from_instruction(line[2:].strip())
            if a:
                names.append(a)
    return Counter(names)


def claim_ids(ent: dict, prop: str) -> list[str]:
    out = []
    for c in ent.get("claims", {}).get(prop, []):
        dv = c.get("mainsnak", {}).get("datavalue", {})
        val = dv.get("value")
        if isinstance(val, dict) and "id" in val:
            out.append(val["id"])
        elif isinstance(val, str):
            out.append(val)
    return out


def is_human(ent: dict) -> bool:
    kinds = set(claim_ids(ent, "P31"))
    if kinds & NON_HUMAN:
        return False
    return HUMAN in kinds


def is_computing(ent: dict) -> bool:
    occ = set(claim_ids(ent, "P106"))
    if occ & COMPUTING:
        return True
    # field of work
    if set(claim_ids(ent, "P101")) & COMPUTING:
        return True
    desc = (ent.get("descriptions", {}).get("en", {}) or {}).get("value") or ""
    return bool(COMPUTING_WORDS.search(desc))


def labels_of(ent: dict) -> list[str]:
    out = []
    for lang, rec in (ent.get("labels") or {}).items():
        if rec.get("value"):
            out.append(rec["value"])
    for lang, arr in (ent.get("aliases") or {}).items():
        for rec in arr:
            if rec.get("value"):
                out.append(rec["value"])
    return out


def exactish(name: str, ent: dict) -> bool:
    want = fold_name(name)
    for lab in labels_of(ent):
        got = fold_name(lab)
        if got == want:
            return True
        # "Donald Knuth" vs "Donald Ervin Knuth" / "Donald E Knuth": same first+last
        ww, gw = want.split(), got.split()
        if len(ww) >= 2 and len(gw) >= 2 and ww[0] == gw[0] and ww[-1] == gw[-1]:
            # middle initials only differ
            mid_w = [p for p in ww[1:-1] if len(p) <= 2]
            mid_g = [p for p in gw[1:-1] if True]
            if ww[1:-1] == gw[1:-1] or (all(len(p) <= 2 for p in ww[1:-1] + gw[1:-1]) and ww[0] == gw[0] and ww[-1] == gw[-1]):
                return True
            # first + last match and the shorter name has no extra middle words
            if (len(ww) == 2 or len(gw) == 2) and ww[0] == gw[0] and ww[-1] == gw[-1]:
                return True
    return False


def search_name(name: str, cache: Path) -> list[str]:
    data = api(WD, {"action": "wbsearchentities", "search": name, "language": "en", "uselang": "en", "type": "item", "limit": "8"}, cache)
    return [h["id"] for h in data.get("search") or [] if h.get("id")]


def entities(ids: list[str], cache: Path) -> dict:
    out = {}
    for i in range(0, len(ids), 40):
        chunk = ids[i : i + 40]
        data = api(WD, {"action": "wbgetentities", "ids": "|".join(chunk), "props": "labels|aliases|descriptions|claims", "languages": "en|mul"}, cache)
        out.update(data.get("entities") or {})
        time.sleep(0.05)
    return out


def pick_candidate(name: str, ents: list[dict]) -> tuple[dict | None, str]:
    humans = [e for e in ents if e.get("type") != "item" or True]
    humans = [e for e in ents if is_human(e)]
    exact = [e for e in humans if exactish(name, e)]
    pool = exact
    if not pool:
        return None, "not-found"
    if len(pool) == 1:
        return pool[0], "unique"
    computing = [e for e in pool if is_computing(e)]
    if len(computing) == 1:
        return computing[0], "computing"
    if len(computing) > 1:
        # if one clearly matches first+last better, still ambiguous if both exact
        return None, "ambiguous"
    return None, "ambiguous"


def plain_html(s: str) -> str:
    if not s:
        return ""
    s = re.sub(r"(?is)<br\s*/?>", ", ", s)
    s = re.sub(r"(?is)<style.*?>.*?</style>", "", s)
    s = re.sub(r"(?is)<[^>]+>", "", s)
    s = html.unescape(s)
    return re.sub(r"\s+", " ", s).strip()


def license_allowed(short: str, usage: str, copyrighted: str) -> bool:
    blob = f"{short} {usage}"
    if LICENSE_BAD.search(blob):
        return False
    if (copyrighted or "").lower() in {"false", "0", "no"}:
        return True
    return bool(LICENSE_OK.search(short or "") or LICENSE_OK.search(usage or ""))


def commons_info(filename: str, cache: Path) -> dict | None:
    title = filename if filename.startswith("File:") else "File:" + filename
    data = api(
        COMMONS,
        {
            "action": "query",
            "titles": title,
            "prop": "imageinfo",
            "iiprop": "url|extmetadata|size|mime",
            "iiurlwidth": str(MAX_EDGE * 2),
        },
        cache,
    )
    pages = (data.get("query") or {}).get("pages") or {}
    for page in pages.values():
        ii = (page.get("imageinfo") or [None])[0]
        if not ii:
            continue
        meta = ii.get("extmetadata") or {}

        def m(k: str) -> str:
            v = meta.get(k, {})
            return (v.get("value") if isinstance(v, dict) else v) or ""

        return {
            "file": filename,
            "url": ii.get("url"),
            "thumb": ii.get("thumburl") or ii.get("url"),
            "mime": ii.get("mime"),
            "width": ii.get("thumbwidth") or ii.get("width"),
            "height": ii.get("thumbheight") or ii.get("height"),
            "license": plain_html(m("LicenseShortName") or m("License")),
            "licenseUrl": m("LicenseUrl"),
            "artist": plain_html(m("Artist")),
            "usage": plain_html(m("UsageTerms")),
            "copyrighted": m("Copyrighted"),
        }
    return None


def choose_image(filenames: list[str], cache: Path, pinned: str | None) -> dict | None:
    names = list(filenames)
    if pinned:
        names = [pinned] + [n for n in names if n != pinned]
    for fn in names[:6]:
        try:
            info = commons_info(fn, cache)
        except Exception as e:  # noqa: BLE001
            print(f"  commons fail {fn}: {e}", flush=True)
            continue
        if not info:
            continue
        if license_allowed(info["license"], info["usage"], info["copyrighted"]):
            return info
        print(f"  skip license {fn}: {info['license']}", flush=True)
    return None


def to_webp(raw: bytes, dest: Path) -> None:
    im = Image.open(BytesIO(raw))
    im = im.convert("RGB")
    w, h = im.size
    scale = MAX_EDGE / max(w, h)
    if scale < 1:
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "WEBP", quality=WEBP_QUALITY, method=6)


def resolve_overrides(raw: dict) -> dict:
    # drop comment keys
    return {k: v for k, v in raw.items() if not k.startswith("_") and isinstance(v, dict)}


def canonical_key(name: str, overrides: dict) -> str:
    seen = set()
    cur = name
    while cur in overrides and overrides[cur].get("aliasOf"):
        if cur in seen:
            break
        seen.add(cur)
        cur = overrides[cur]["aliasOf"]
    return cur


def main() -> int:
    here = Path(__file__).resolve()
    game = here.parents[1]
    ap = argparse.ArgumentParser()
    ap.add_argument("--typ", required=True, type=Path)
    ap.add_argument("--out-img", type=Path, default=game / "public/img/typing/portraits")
    ap.add_argument("--catalog", type=Path, default=game / "src/modules/typing/portraits/catalog.json")
    ap.add_argument("--credits", type=Path, default=game / "src/modules/typing/portraits/CREDITS.md")
    ap.add_argument("--overrides", type=Path, default=game / "src/modules/typing/portraits/overrides.json")
    ap.add_argument("--report", type=Path, default=game / "src/modules/typing/portraits/unmatched.json")
    ap.add_argument("--cache", type=Path, default=CACHE_DEFAULT)
    ap.add_argument("--limit", type=int, default=0, help="resolve only the first N unique names (debug)")
    args = ap.parse_args()

    if not args.typ.exists():
        print(f"missing typ file: {args.typ}", file=sys.stderr)
        return 2

    overrides = resolve_overrides(json.loads(args.overrides.read_text(encoding="utf-8")))
    counts = extract_authors(args.typ)
    names = list(counts.keys())
    if args.limit:
        names = names[: args.limit]

    # Group display names under a canonical override key when present.
    groups: dict[str, list[str]] = defaultdict(list)
    for n in names:
        groups[canonical_key(n, overrides)].append(n)

    # Resolve each canonical key once.
    status: dict[str, dict] = {}
    to_search: list[str] = []
    for key, aliases in groups.items():
        ov = overrides.get(key) or {}
        # if this canonical was only reached via aliasOf and has no record, still search the key
        if ov.get("skip"):
            for a in aliases:
                status[a] = {"status": "skipped", "reason": ov.get("reason") or "skipped"}
            continue
        if MULTI_AUTHOR.search(key) and not ov.get("qid") and not ov.get("file") and not ov.get("search"):
            for a in aliases:
                status[a] = {"status": "multi-author", "reason": "two or more people in the attribution"}
            continue
        to_search.append(key)

    # Wikidata searches
    search_ids: dict[str, list[str]] = {}
    print(f"searching {len(to_search)} names…", flush=True)

    def do_search(key: str) -> tuple[str, list[str]]:
        ov = overrides.get(key) or {}
        if ov.get("qid") and not ov.get("search"):
            return key, [ov["qid"]]
        q = ov.get("search") or key
        ids = search_name(q, args.cache)
        if ov.get("qid") and ov["qid"] not in ids:
            ids = [ov["qid"]] + ids
        time.sleep(0.25)
        return key, ids

    with ThreadPoolExecutor(max_workers=1) as ex:
        futs = [ex.submit(do_search, k) for k in to_search]
        for i, fut in enumerate(as_completed(futs), 1):
            k, ids = fut.result()
            search_ids[k] = ids
            if i % 40 == 0:
                print(f"  searched {i}/{len(to_search)}", flush=True)

    all_ids = sorted({i for ids in search_ids.values() for i in ids})
    print(f"fetching {len(all_ids)} entities…", flush=True)
    ents = entities(all_ids, args.cache)
    # Re-fetch override qids that landed as "missing" (stale or collided cache).
    retry_ids = []
    for key in to_search:
        qid = (overrides.get(key) or {}).get("qid")
        if qid and (qid not in ents or "missing" in ents.get(qid, {})):
            retry_ids.append(qid)
    if retry_ids:
        print(f"re-fetching {len(retry_ids)} override entities…", flush=True)
        ents.update(entities(sorted(set(retry_ids)), args.cache))

    chosen: dict[str, dict] = {}  # canonical key -> {qid, ent, reason}
    for key in to_search:
        ov = overrides.get(key) or {}
        cand_ents = [ents[i] for i in search_ids.get(key, []) if i in ents and "missing" not in ents[i]]
        if ov.get("qid") and ov["qid"] in ents and "missing" not in ents[ov["qid"]]:
            ent = ents[ov["qid"]]
            if is_human(ent):
                chosen[key] = {"qid": ov["qid"], "ent": ent, "reason": "override"}
                continue
            print(f"  override qid not human: {key} {ov['qid']}", flush=True)
        match_name = ov.get("search") or key
        ent, reason = pick_candidate(match_name, cand_ents)
        if ent:
            chosen[key] = {"qid": ent["id"], "ent": ent, "reason": reason}
        else:
            for a in groups[key]:
                status[a] = {"status": reason, "reason": reason}

    print(f"resolved {len(chosen)} people, fetching portraits…", flush=True)

    # Images
    portraits: dict[str, dict] = {}  # qid -> catalog row
    used_slugs: set[str] = set()
    args.out_img.mkdir(parents=True, exist_ok=True)

    # Remove previous jpg/webp we'll rewrite; keep folder
    # (done after successful writes per file)

    for key, ch in chosen.items():
        qid = ch["qid"]
        if qid in portraits:
            continue
        ent = ch["ent"]
        files = claim_ids(ent, "P18")
        ov = overrides.get(key) or {}
        pinned = ov.get("file")
        info = choose_image(files, args.cache, pinned)
        if not info:
            for a in groups[key]:
                status[a] = {"status": "no-free-image", "reason": "no freely licensed Commons photo (P18)", "qid": qid}
            continue
        label = (ent.get("labels", {}).get("en") or {}).get("value") or key
        base = slug(label if not MULTI_AUTHOR.search(label) else key)
        if base in used_slugs:
            base = f"{base}-{qid.lower()}"
        used_slugs.add(base)
        dest = args.out_img / f"{base}.webp"
        src = info["thumb"] or info["url"]
        try:
            raw = get(src, args.cache)
            to_webp(raw, dest)
        except Exception as e:  # noqa: BLE001
            print(f"  download fail {key}: {e}", flush=True)
            for a in groups[key]:
                status[a] = {"status": "download-failed", "reason": str(e), "qid": qid}
            continue
        portraits[qid] = {
            "author": label,
            "aliases": [],
            "qid": qid,
            "file": f"/img/typing/portraits/{dest.name}",
            "sourceFile": info["file"],
            "sourceUrl": "https://commons.wikimedia.org/wiki/File:" + info["file"].replace(" ", "_"),
            "license": info["license"],
            "licenseUrl": info["licenseUrl"],
            "artist": info["artist"] or "unknown",
            "attributionRequired": not re.search(r"cc0|public domain|\bpd\b", info["license"], re.I),
            "_bytes": dest.stat().st_size,
            "_path": str(dest),
        }

    # Attach display names / aliases from the typ file
    for key, ch in chosen.items():
        qid = ch["qid"]
        if qid not in portraits:
            continue
        row = portraits[qid]
        for a in groups[key]:
            status[a] = {"status": "matched", "qid": qid, "file": row["file"]}
            if fold_name(a) != fold_name(row["author"]) and a not in row["aliases"]:
                row["aliases"].append(a)
        # also add the canonical typ key if different
        if fold_name(key) != fold_name(row["author"]) and key not in row["aliases"]:
            row["aliases"].append(key)

    catalog = []
    for qid, row in portraits.items():
        aliases = sorted(set(row["aliases"]), key=str.lower)
        catalog.append({k: row[k] for k in ("author", "aliases", "qid", "file", "sourceFile", "sourceUrl", "license", "licenseUrl", "artist", "attributionRequired")} | {"aliases": aliases})
    catalog.sort(key=lambda r: r["author"].lower())
    args.catalog.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # CREDITS
    lines = [
        "# Portrait credits",
        "",
        "Author portraits bundled with the typing module are used under the licenses",
        "named below. They were selected from a public media catalog through a public",
        "person database (image property), then checked so only works under CC BY,",
        "CC BY-SA, CC0, or the public domain are included. Authors not listed here",
        "use a faceless silhouette. Full machine-readable rows are in `catalog.json`.",
        "",
        "| Author | Commons file | License | Artist | Page |",
        "|---|---|---|---|---|",
    ]
    for row in catalog:
        artist = row["artist"].replace("|", "/")
        lines.append(f"| {row['author']} | {row['sourceFile']} | {row['license']} | {artist} | {row['sourceUrl']} |")
    lines.append("")
    args.credits.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # Report
    by_status: dict[str, list[str]] = defaultdict(list)
    for n in names:
        st = status.get(n, {"status": "not-found"})
        by_status[st["status"]].append(n)
    report = {
        "uniqueNames": len(names),
        "matchedPeople": len(catalog),
        "matchedNames": len(by_status.get("matched", [])),
        "byStatus": {k: sorted(v, key=str.lower) for k, v in by_status.items()},
        "counts": {k: len(v) for k, v in by_status.items()},
        "bundleBytes": sum(r["_bytes"] for r in portraits.values()),
        "bundleFiles": len(portraits),
    }
    args.report.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # Clean leftover images not in the new catalog
    keep = {Path(r["file"]).name for r in catalog}
    for p in args.out_img.glob("*"):
        if p.is_file() and p.name not in keep:
            p.unlink()
            print(f"  removed leftover {p.name}", flush=True)

    kb = report["bundleBytes"] / 1024
    print(
        f"done: {report['matchedPeople']} people, {report['matchedNames']}/{report['uniqueNames']} names, "
        f"bundle {kb:.1f} KB ({report['bundleFiles']} webp)"
    )
    print("counts:", report["counts"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

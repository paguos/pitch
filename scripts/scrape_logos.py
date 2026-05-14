#!/usr/bin/env python3
from __future__ import annotations
"""
Scrape team logos from football-logos.cc.

For clubs: fetch each country index page once, extract hashed PNG URLs for all
clubs listed, match against our team catalog by slug.

For national teams: fetch /<country>/<country-slug>-national-team/ pages.

Outputs:
  - PNG files in frontend/public/logos/<slug>.png  (resized to 256x256 PNG)
  - scripts/logos_mapping.json with {team_name: "/logos/<slug>.png"}

Run: python3 scripts/scrape_logos.py
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOGO_DIR = ROOT / "frontend" / "public" / "logos"
LOGO_DIR.mkdir(parents=True, exist_ok=True)
MAPPING_OUT = ROOT / "scripts" / "logos_mapping.json"

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

# ---------------------------------------------------------------------------
# 1) Club catalog: (team_name, country_slug, logo_slug)
#    country_slug = football-logos.cc country
#    logo_slug    = football-logos.cc team slug on that country
# ---------------------------------------------------------------------------

CLUBS = [
    # Premier League (England) — country slug "england"
    ("Liverpool",                "england", "liverpool"),
    ("Arsenal",                  "england", "arsenal"),
    ("Manchester City",          "england", "manchester-city"),
    ("Chelsea",                  "england", "chelsea"),
    ("Newcastle United",         "england", "newcastle"),
    ("Aston Villa",              "england", "aston-villa"),
    ("Nottingham Forest",        "england", "nottingham-forest"),
    ("Brighton & Hove Albion",   "england", "brighton"),
    ("AFC Bournemouth",          "england", "bournemouth"),
    ("Brentford",                "england", "brentford"),
    ("Fulham",                   "england", "fulham"),
    ("Crystal Palace",           "england", "crystal-palace"),
    ("Everton",                  "england", "everton"),
    ("West Ham United",          "england", "west-ham"),
    ("Manchester United",        "england", "manchester-united"),
    ("Wolverhampton Wanderers",  "england", "wolves"),
    ("Tottenham Hotspur",        "england", "tottenham"),
    ("Leeds United",             "england", "leeds-united"),
    ("Burnley",                  "england", "burnley"),
    ("Sunderland",               "england", "sunderland"),

    # La Liga (Spain) — country slug "spain"
    ("Real Madrid",       "spain", "real-madrid"),
    ("FC Barcelona",      "spain", "barcelona"),
    ("Atletico Madrid",   "spain", "atletico-madrid"),
    ("Athletic Club",     "spain", "athletic-club"),
    ("Real Sociedad",     "spain", "real-sociedad"),
    ("Real Betis",        "spain", "real-betis"),
    ("Villarreal CF",     "spain", "villarreal"),
    ("Valencia CF",       "spain", "valencia"),
    ("Sevilla FC",        "spain", "sevilla"),
    ("Girona FC",         "spain", "girona"),
    ("Celta Vigo",        "spain", "celta"),
    ("CA Osasuna",        "spain", "osasuna"),
    ("RCD Mallorca",      "spain", "mallorca"),
    ("Rayo Vallecano",    "spain", "rayo-vallecano"),
    ("Getafe CF",         "spain", "getafe"),
    ("RCD Espanyol",      "spain", "espanyol"),
    ("Deportivo Alaves",  "spain", "deportivo"),
    ("Levante UD",        "spain", "levante"),
    ("Elche CF",          "spain", "elche"),
    ("Real Oviedo",       "spain", "oviedo"),

    # Bundesliga (Germany) — country slug "germany"
    ("Bayern Munich",            "germany", "bayern-munchen"),
    ("Bayer Leverkusen",         "germany", "bayer-leverkusen"),
    ("Borussia Dortmund",        "germany", "borussia-dortmund"),
    ("RB Leipzig",               "germany", "rb-leipzig"),
    ("VfB Stuttgart",            "germany", "vfb-stuttgart"),
    ("Eintracht Frankfurt",      "germany", "eintracht-frankfurt"),
    ("Borussia Monchengladbach", "germany", "borussia-monchengladbach"),
    ("VfL Wolfsburg",            "germany", "wolfsburg"),
    ("SC Freiburg",              "germany", "freiburg"),
    ("1. FSV Mainz 05",          "germany", "mainz-05"),
    ("TSG Hoffenheim",           "germany", "hoffenheim"),
    ("Werder Bremen",            "germany", "werder-bremen"),
    ("FC Augsburg",              "germany", "augsburg"),
    ("FC St. Pauli",             "germany", "st-pauli"),
    ("1. FC Heidenheim",         "germany", "fc-heidenheim"),
    ("1. FC Koln",               "germany", "koln"),
    ("Hamburger SV",             "germany", "hamburger-sv"),
    ("1. FC Union Berlin",       "germany", "union-berlin"),

    # Serie A (Italy) — country slug "italy"
    ("Inter Milan",        "italy", "inter"),
    ("AC Milan",           "italy", "milan"),
    ("Juventus",           "italy", "juventus"),
    ("Napoli",             "italy", "napoli"),
    ("AS Roma",            "italy", "roma"),
    ("SS Lazio",           "italy", "lazio"),
    ("Atalanta",           "italy", "atalanta"),
    ("Bologna",            "italy", "bologna"),
    ("Fiorentina",         "italy", "fiorentina"),
    ("Torino",             "italy", "torino"),
    ("Udinese",            "italy", "udinese"),
    ("Genoa",              "italy", "genoa"),
    ("Cagliari",           "italy", "cagliari"),
    ("Hellas Verona",      "italy", "verona"),
    ("Como",               "italy", "como-1907"),
    ("Lecce",              "italy", "lecce"),
    ("Parma",              "italy", "parma"),
    ("Cremonese",          "italy", "cremonese"),
    ("Pisa",               "italy", "pisa"),
    ("Sassuolo",           "italy", "sassuolo"),

    # Ligue 1 (France) — country slug "france"
    ("Paris Saint-Germain",   "france", "paris-saint-germain"),
    ("Olympique de Marseille","france", "marseille"),
    ("AS Monaco",             "france", "as-monaco"),
    ("LOSC Lille",            "france", "lille"),
    ("OGC Nice",              "france", "nice"),
    ("Olympique Lyonnais",    "france", "lyon"),
    ("RC Lens",               "france", "rc-lens"),
    ("RC Strasbourg",         "france", "rc-strasbourg-alsace"),
    ("Stade Rennais",         "france", "rennes"),
    ("Toulouse FC",           "france", "toulouse"),
    ("FC Nantes",             "france", "nantes"),
    ("Stade Brestois",        "france", "brest"),
    ("Auxerre",               "france", "auxerre"),
    ("Le Havre AC",           "france", "le-havre-ac"),
    ("Angers SCO",            "france", "angers"),
    ("FC Lorient",            "france", "lorient"),
    ("FC Metz",               "france", "fc-metz"),
    ("Paris FC",              "france", "paris-fc"),
]

# ---------------------------------------------------------------------------
# 2) National teams: (team_name, country_slug, page_slug)
#    page is /<country_slug>/<page_slug>/
# ---------------------------------------------------------------------------

NATIONALS = [
    # UEFA
    ("France",         "france",          "france-national-team"),
    ("England",        "england",         "england-national-team"),
    ("Spain",          "spain",           "spain-national-team"),
    ("Germany",        "germany",         "germany-national-team"),
    ("Italy",          "italy",           "italy-national-team"),
    ("Portugal",       "portugal",        "portuguese-football-federation"),
    ("Netherlands",    "netherlands",     "dutch-national-team"),
    ("Belgium",        "belgium",         "belgium-national-team"),
    ("Croatia",        "croatia",         "croatia-national-team"),
    ("Switzerland",    "switzerland",     "switzerland-national-team"),
    ("Denmark",        "denmark",         "denmark-national-team"),
    ("Austria",        "austria",         "austria-national-team"),
    ("Poland",         "poland",          "poland-national-team"),
    ("Sweden",         "sweden",          "sweden-national-team"),
    ("Ukraine",        "ukraine",         "ukraine-national-team"),
    ("Türkiye",        "turkey",          "turkey-national-team"),
    ("Serbia",         "serbia",          "serbia-national-team"),
    ("Wales",          "wales",           "wales-national-team"),
    ("Hungary",        "hungary",         "hungary-national-team"),
    ("Czech Republic", "czech-republic",  "czech-republic-national-team"),
    ("Norway",         "norway",          "norway-national-team"),
    ("Scotland",       "scotland",        "scotland-national-team"),
    # CONMEBOL
    ("Brazil",     "brazil",     "brazil-national-team"),
    ("Argentina",  "argentina",  "argentina-national-team"),
    ("Uruguay",    "uruguay",    "uruguay-national-team"),
    ("Colombia",   "colombia",   "colombia-national-team"),
    ("Ecuador",    "ecuador",    "ecuador-national-team"),
    ("Peru",       "peru",       "peru-national-team"),
    ("Chile",      "chile",      "chile-national-team"),
    ("Paraguay",   "paraguay",   "paraguay-national-team"),
    ("Venezuela",  "venezuela",  "venezuela-national-team"),
    # CONCACAF
    ("USA",         "usa",          "usa-national-team"),
    ("Mexico",      "mexico",       "mexico-national-team"),
    ("Canada",      "canada",       "canada-national-team"),
    ("Costa Rica",  "costa-rica",   "costa-rica-national-team"),
    ("Panama",      "panama",       "panama-national-team"),
    ("Jamaica",     "jamaica",      "jamaica-national-team"),
    # AFC
    ("Japan",         "japan",         "japan-national-team"),
    ("South Korea",   "south-korea",   "south-korea-national-team"),
    ("Iran",          "iran",          "iran-national-team"),
    ("Australia",     "australia",     "australia-national-team"),
    ("Saudi Arabia",  "saudi-arabia",  "saudi-arabia-national-team"),
    ("Qatar",         "qatar",         "qatar-national-team"),
    ("Iraq",          "iraq",          "iraq-national-team"),
    # CAF
    ("Morocco",     "morocco",       "morocco-national-team"),
    ("Senegal",     "senegal",       "senegal-national-team"),
    ("Egypt",       "egypt",         "egypt-national-team"),
    ("Algeria",     "algeria",       "algeria-national-team"),
    ("Nigeria",     "nigeria",       "nigeria-national-team"),
    ("Tunisia",     "tunisia",       "tunisia-national-team"),
    ("Ivory Coast", "cote-d-ivoire", "cote-d-ivoire-national-team"),
    ("Cameroon",    "cameroon",      "cameroon-national-team"),
    ("Ghana",       "ghana",         "ghana-national-team"),
]


def http_get(url: str, retries: int = 2) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    last_err = None
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code == 404:
                raise
            time.sleep(0.5 * (attempt + 1))
        except Exception as e:
            last_err = e
            time.sleep(0.5 * (attempt + 1))
    raise last_err


def extract_country_index(country_slug: str) -> dict[str, str]:
    """Return {logo_slug: full_png_url} for all teams listed on the country index."""
    url = f"https://football-logos.cc/{country_slug}/"
    print(f"[index] fetching {url}", flush=True)
    html = http_get(url).decode("utf-8", errors="replace")
    # 1500x1500 entries are the primary card
    pattern = re.compile(
        rf"https://assets\.football-logos\.cc/logos/{re.escape(country_slug)}/1500x1500/([a-z0-9-]+)\.([a-f0-9]+)\.png"
    )
    out: dict[str, str] = {}
    for m in pattern.finditer(html):
        slug, h = m.group(1), m.group(2)
        if slug not in out:
            out[slug] = f"https://assets.football-logos.cc/logos/{country_slug}/1500x1500/{slug}.{h}.png"
    return out


def extract_team_page_png(country_slug: str, page_slug: str) -> str | None:
    """Scrape a specific team page (used for nationals). Returns full PNG URL."""
    url = f"https://football-logos.cc/{country_slug}/{page_slug}/"
    print(f"[page]  fetching {url}", flush=True)
    try:
        html = http_get(url).decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        print(f"  -> {e.code} {e.reason}", flush=True)
        return None
    pattern = re.compile(
        rf"https://assets\.football-logos\.cc/logos/{re.escape(country_slug)}/1500x1500/{re.escape(page_slug)}\.([a-f0-9]+)\.png"
    )
    m = pattern.search(html)
    if not m:
        # fallback: any 1500x1500 png on the page that contains the page_slug
        alt = re.search(
            rf"https://assets\.football-logos\.cc/logos/{re.escape(country_slug)}/1500x1500/[a-z0-9-]*{re.escape(page_slug)}[a-z0-9-]*\.[a-f0-9]+\.png",
            html,
        )
        if alt:
            return alt.group(0)
        return None
    return m.group(0)


def download(url: str, dest: Path) -> bool:
    try:
        data = http_get(url)
    except Exception as e:
        print(f"  ! download failed: {e}", flush=True)
        return False
    dest.write_bytes(data)
    return True


def main() -> int:
    mapping: dict[str, str] = {}
    missing: list[str] = []

    # ---- clubs: fetch country indexes once
    needed_countries = sorted({c for _, c, _ in CLUBS})
    index_by_country: dict[str, dict[str, str]] = {}
    for c in needed_countries:
        try:
            index_by_country[c] = extract_country_index(c)
        except Exception as e:
            print(f"  ! could not load country {c}: {e}", flush=True)
            index_by_country[c] = {}

    for name, country, slug in CLUBS:
        idx = index_by_country.get(country, {})
        url = idx.get(slug)
        if not url:
            print(f"  - club not found in index: {name} ({country}/{slug})", flush=True)
            missing.append(name)
            continue
        local = f"{country}--{slug}.png"
        dest = LOGO_DIR / local
        if not dest.exists() and not download(url, dest):
            missing.append(name)
            continue
        mapping[name] = f"/logos/{local}"

    # ---- nationals: per-team page fetch
    for name, country, page in NATIONALS:
        url = extract_team_page_png(country, page)
        if not url:
            print(f"  - national missing: {name} ({country}/{page})", flush=True)
            missing.append(name)
            continue
        local = f"national--{page}.png"
        dest = LOGO_DIR / local
        if not dest.exists() and not download(url, dest):
            missing.append(name)
            continue
        mapping[name] = f"/logos/{local}"
        time.sleep(0.1)

    MAPPING_OUT.write_text(json.dumps(mapping, indent=2, ensure_ascii=False) + "\n")
    print(f"\nWrote {len(mapping)} mappings to {MAPPING_OUT}")
    print(f"Missing: {len(missing)}")
    if missing:
        for m in missing:
            print(f"  - {m}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

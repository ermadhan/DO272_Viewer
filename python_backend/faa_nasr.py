"""Import the current FAA NASR airport CSV subset without inventing map data."""

import csv
import io
import math
import re
import zipfile
from html.parser import HTMLParser
from urllib.error import URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen


SUBSCRIPTION_URL = "https://www.faa.gov/air_traffic/flight_info/aeronav/Aero_Data/NASR_Subscription/"
MAX_DOWNLOAD = 40 * 1024 * 1024
MAX_CSV = 25 * 1024 * 1024


class FeedError(Exception):
    pass


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.hrefs.append(href)


def download(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": "DO272-Viewer/1.0"})
    try:
        with urlopen(request, timeout=45) as response:
            data = response.read(MAX_DOWNLOAD + 1)
    except (URLError, TimeoutError, OSError) as error:
        raise FeedError(f"FAA feed could not be downloaded: {error}") from error
    if len(data) > MAX_DOWNLOAD:
        raise FeedError("FAA response exceeds the download size limit")
    return data


def current_archive_url() -> str:
    page = download(SUBSCRIPTION_URL).decode("utf-8")
    parser = Links()
    parser.feed(page)
    match = re.search(r"Subscription effective ([A-Za-z]+ \d{1,2}, \d{4})", page[page.find("Current"):])
    if not match:
        raise FeedError("FAA current cycle link was not found")
    from datetime import datetime
    try:
        cycle = datetime.strptime(match.group(1), "%B %d, %Y")
    except ValueError as error:
        raise FeedError("FAA current cycle date could not be parsed") from error
    page_url = urljoin(SUBSCRIPTION_URL, cycle.strftime("%Y-%m-%d/"))
    parser = Links()
    parser.feed(download(page_url).decode("utf-8"))
    candidates = [urljoin(page_url, href) for href in parser.hrefs if href.upper().endswith("_APT_CSV.ZIP")]
    if len(candidates) != 1 or urlparse(candidates[0]).hostname != "nfdc.faa.gov":
        raise FeedError("FAA airport CSV archive link was missing or ambiguous")
    return candidates[0]


def _number(value: str) -> float | None:
    if not value:
        return None
    try:
        result = float(value)
    except ValueError as error:
        raise FeedError(f"Invalid numeric value in FAA data: {value}") from error
    if not math.isfinite(result):
        raise FeedError("Non-finite numeric value in FAA data")
    return result


def parse_archive(data: bytes, icao: str, source_url: str) -> dict:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            def read_rows(name):
                entry = archive.getinfo(name)
                if entry.file_size > MAX_CSV:
                    raise FeedError(f"FAA {name} exceeds the size limit")
                with archive.open(entry) as stream:
                    yield from csv.DictReader(io.TextIOWrapper(stream, encoding="utf-8-sig", newline=""))
            matches = [row for row in read_rows("APT_BASE.csv") if row.get("ICAO_ID", "").strip().upper() == icao]
            if not matches:
                raise FeedError(f"No FAA NASR airport record found for {icao}; other curated providers are not yet supported")
            if len(matches) != 1:
                raise FeedError(f"FAA returned multiple airport records for {icao}")
            airport = matches[0]
            site = airport["SITE_NO"]
            runway_rows = [row for row in read_rows("APT_RWY.csv") if row["SITE_NO"] == site]
            end_rows = [row for row in read_rows("APT_RWY_END.csv") if row["SITE_NO"] == site]
    except (zipfile.BadZipFile, KeyError, UnicodeError, csv.Error) as error:
        raise FeedError(f"FAA airport archive has an invalid format: {error}") from error
    lat, lon = _number(airport["LAT_DECIMAL"]), _number(airport["LONG_DECIMAL"])
    if lat is None or lon is None or not -90 <= lat <= 90 or not -180 <= lon <= 180:
        raise FeedError("FAA airport reference point is missing or invalid")
    ends: dict[str, list[dict]] = {}
    for row in end_rows:
        ends.setdefault(row["RWY_ID"], []).append(row)
    features = []
    skipped = []
    for row in runway_rows:
        runway_id = row["RWY_ID"]
        runway_ends = ends.get(runway_id, [])
        points = []
        for end in runway_ends:
            end_lat, end_lon = _number(end["LAT_DECIMAL"]), _number(end["LONG_DECIMAL"])
            if end_lat is not None and end_lon is not None and -90 <= end_lat <= 90 and -180 <= end_lon <= 180:
                points.append([end_lat, end_lon])
        if len(points) != 2:
            skipped.append(runway_id)
            continue
        feature = {
            "id": f"FAA-RWY-{site.strip()}-{runway_id}", "aerodromeId": icao,
            "featureClass": "RunwayElement", "designator": runway_id,
            "status": "Unknown", "geometryType": "LineString", "coordinates": points,
            "properties": {"faaSiteNumber": site, "source": "FAA NASR"},
        }
        for column, key in (("RWY_LEN", "lengthMeters"), ("RWY_WIDTH", "widthMeters")):
            value = _number(row[column])
            if value is not None:
                feature[key] = round(value * 0.3048, 3)
        features.append(feature)
    elevation = _number(airport["ELEV"])
    dataset = {
        "icao": icao, "iata": "", "name": airport["ARPT_NAME"], "city": airport["CITY"],
        "country": airport["COUNTRY_CODE"], "center": [lat, lon],
        "elevationMeters": round(elevation * 0.3048, 3) if elevation is not None else None,
        "magneticVariation": "", "transitionAltitudeFt": None,
        "source": "FAA NASR (partial)", "features": features,
    }
    return {
        "dataset": dataset, "sourceUrl": source_url, "provider": "FAA NASR",
        "effectiveDate": airport["EFF_DATE"], "datum": "NAD 83",
        "coverage": "Airport reference point and runway centerlines with two published endpoints only; not a complete AMDB.",
        "skippedRunways": skipped,
        "raw": {"airport": airport, "runways": runway_rows, "runwayEnds": end_rows},
    }


def fetch_airport(icao: str) -> dict:
    archive_url = current_archive_url()
    return parse_archive(download(archive_url), icao, archive_url)

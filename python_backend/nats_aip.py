"""Import the published UK AIP airport and runway threshold subset."""

import io
import math
import re
import zipfile
from datetime import datetime, timezone
from urllib.error import URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

from faa_nasr import FeedError, Links

PAGE_URL = "https://nats-uk.ead-it.com/cms-nats/opencms/en/Publications/digital-datasets/"
MAX_DOWNLOAD = 40 * 1024 * 1024
MAX_XML = 100 * 1024 * 1024
NS = {"a": "http://www.aixm.aero/schema/5.1", "g": "http://www.opengis.net/gml/3.2"}
HREF = "{http://www.w3.org/1999/xlink}href"
CRS = "urn:ogc:def:crs:EPSG::4326"


def download(url: str) -> bytes:
    try:
        with urlopen(Request(url, headers={"User-Agent": "DO272-Viewer/1.0"}), timeout=60) as response:
            data = response.read(MAX_DOWNLOAD + 1)
    except (URLError, TimeoutError, OSError) as error:
        raise FeedError(f"NATS feed could not be downloaded: {error}") from error
    if len(data) > MAX_DOWNLOAD:
        raise FeedError("NATS response exceeds the download size limit")
    return data


def current_archive_url(page: str, now: datetime) -> tuple[str, str]:
    links = Links()
    links.feed(page)
    candidates = []
    for href in links.hrefs:
        match = re.search(r"/ICAO_AIP/EG_AIP_DS_(\d{8})_XML\.zip$", href, re.I)
        if not match:
            continue
        url = urljoin(PAGE_URL, href)
        if urlparse(url).hostname != "nats-uk.ead-it.com":
            continue
        try:
            effective = datetime.strptime(match.group(1), "%Y%m%d").date()
        except ValueError as error:
            raise FeedError("Invalid NATS cycle date") from error
        if effective <= now.date():
            candidates.append((effective, url))
    if not candidates:
        raise FeedError("No current NATS AIP archive was found")
    effective, url = max(candidates)
    return url, effective.isoformat()


def _slice(feature: ET.Element, now: datetime) -> ET.Element | None:
    valid = []
    for item in feature.findall("a:timeSlice/*", NS):
        if item.findtext("a:interpretation", namespaces=NS) != "BASELINE":
            continue
        period = item.find("g:validTime/g:TimePeriod", NS)
        if period is None:
            raise FeedError("NATS baseline has no validity period")
        start = period.findtext("g:beginPosition", namespaces=NS)
        end = period.findtext("g:endPosition", namespaces=NS)
        try:
            begin = datetime.fromisoformat(start.replace("Z", "+00:00")) if start else None
            finish = datetime.fromisoformat(end.replace("Z", "+00:00")) if end else None
            if begin is None or begin.tzinfo is None or (finish is not None and finish.tzinfo is None):
                raise ValueError("missing timezone or begin time")
        except ValueError as error:
            raise FeedError("Invalid NATS baseline validity period") from error
        if begin <= now and (finish is None or now < finish):
            valid.append(item)
    if len(valid) > 1:
        raise FeedError("NATS contains overlapping baseline time slices")
    return valid[0] if valid else None


def _point(item: ET.Element, path: str) -> list[float] | None:
    point = item.find(path, NS)
    if point is None or point.get("srsName") != CRS:
        return None
    pos = point.find("g:pos", NS)
    if pos is None or not pos.text or pos.get("srsName", CRS) != CRS:
        return None
    try:
        values = [float(value) for value in pos.text.split()]
    except ValueError:
        return None
    if len(values) != 2 or not all(math.isfinite(value) for value in values):
        return None
    if not -90 <= values[0] <= 90 or not -180 <= values[1] <= 180:
        return None
    return values


def _metres(item: ET.Element, name: str) -> float | None:
    value = item.find(f"a:{name}", NS)
    if value is None or not value.text or value.get("uom") not in ("M", "FT"):
        return None
    try:
        number = float(value.text)
    except ValueError as error:
        raise FeedError(f"Invalid NATS {name}") from error
    if not math.isfinite(number):
        raise FeedError(f"Invalid NATS {name}")
    return round(number * (0.3048 if value.get("uom") == "FT" else 1), 3)


def _ref(item: ET.Element, name: str) -> str:
    node = item.find(f"a:{name}", NS)
    return node.get(HREF, "").removeprefix("urn:uuid:") if node is not None else ""


def parse_archive(data: bytes, icao: str, source_url: str, effective_date: str, now: datetime) -> dict:
    records: dict[str, list[ET.Element]] = {name: [] for name in (
        "AirportHeliport", "Runway", "RunwayDirection", "RunwayCentrelinePoint"
    )}
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            matches = [entry for entry in archive.infolist()
                       if re.fullmatch(r"EG_AIP_DS_FULL_\d{8}\.xml", entry.filename, re.I)]
            expected = effective_date.replace("-", "")
            if len(matches) != 1 or expected not in matches[0].filename or matches[0].file_size > MAX_XML:
                raise FeedError("NATS full dataset is missing, mismatched, or exceeds the size limit")
            with archive.open(matches[0]) as stream:
                for _, member in ET.iterparse(stream, events=("end",)):
                    if member.tag == "{http://www.aixm.aero/schema/5.1/message}hasMember":
                        if len(member):
                            feature = member[0]
                            name = feature.tag.rsplit("}", 1)[-1]
                            if name in records:
                                records[name].append(feature)
                        member.clear()
    except (zipfile.BadZipFile, ET.ParseError, OSError) as error:
        raise FeedError(f"Invalid NATS archive: {error}") from error

    airports = []
    for feature in records["AirportHeliport"]:
        item = _slice(feature, now)
        if item is not None and item.findtext("a:locationIndicatorICAO", namespaces=NS) == icao:
            airports.append((feature, item))
    if len(airports) != 1:
        raise FeedError(f"NATS returned {len(airports)} current airport records for {icao}")
    airport, airport_slice = airports[0]
    airport_id = airport.findtext("g:identifier", namespaces=NS)
    center = _point(airport_slice, "a:ARP/a:ElevatedPoint")
    if not airport_id or center is None:
        raise FeedError("NATS airport identifier or reference point is missing or unsupported")
    runways = {}
    for feature in records["Runway"]:
        item = _slice(feature, now)
        if item is not None and _ref(item, "associatedAirportHeliport") == airport_id:
            identifier = feature.findtext("g:identifier", namespaces=NS)
            if not identifier or identifier in runways:
                raise FeedError("NATS runway identifier is missing or duplicated")
            runways[identifier] = (feature, item)
    directions = {}
    for feature in records["RunwayDirection"]:
        item = _slice(feature, now)
        if item is not None and _ref(item, "usedRunway") in runways:
            identifier = feature.findtext("g:identifier", namespaces=NS)
            if not identifier or identifier in directions:
                raise FeedError("NATS runway direction identifier is missing or duplicated")
            directions[identifier] = (feature, item)
    points: dict[str, list[tuple[ET.Element, list[float]]]] = {}
    raw_points = []
    for feature in records["RunwayCentrelinePoint"]:
        item = _slice(feature, now)
        if item is not None and _ref(item, "onRunway") in directions:
            raw_points.append(feature)
            if item.findtext("a:role", namespaces=NS) not in ("THR", "DISTHR"):
                continue
            direction_id = _ref(item, "onRunway")
            point = _point(item, "a:location/a:ElevatedPoint")
            if point is not None:
                points.setdefault(direction_id, []).append((feature, point))
    features, skipped = [], []
    for identifier, (feature, item) in runways.items():
        designator = item.findtext("a:designator", default="", namespaces=NS)
        if item.findtext("a:type", namespaces=NS) != "RWY":
            skipped.append(designator or identifier)
            continue
        ends = [(direction_id, direction) for direction_id, (_, direction) in directions.items()
                if _ref(direction, "usedRunway") == identifier]
        expected = designator.split("/")
        if len(ends) != 2 or len(expected) != 2 or sorted(expected) != sorted(
            direction.findtext("a:designator", default="", namespaces=NS) for _, direction in ends
        ) or any(len(points.get(direction_id, [])) != 1 for direction_id, _ in ends):
            skipped.append(designator or identifier)
            continue
        coords = [points[direction_id][0][1] for direction_id, _ in ends]
        mapped = {
            "id": f"NATS-RWY-{identifier}", "aerodromeId": icao, "featureClass": "RunwayElement",
            "designator": designator, "status": "Unknown", "geometryType": "LineString",
            "coordinates": coords, "properties": {"source": "NATS UK AIP", "geometry": "threshold-to-threshold"},
        }
        for field, key in (("nominalLength", "lengthMeters"), ("nominalWidth", "widthMeters")):
            value = _metres(item, field)
            if value is not None:
                mapped[key] = value
        features.append(mapped)
    def xml(items):
        return [ET.tostring(item, encoding="unicode") for item in items]
    return {
        "dataset": {"icao": icao, "iata": airport_slice.findtext("a:designatorIATA", default="", namespaces=NS) or "",
                    "name": airport_slice.findtext("a:name", default="", namespaces=NS), "city": "",
                    "country": "United Kingdom / Crown Dependencies", "center": center, "elevationMeters": _metres(airport_slice, "fieldElevation"),
                    "magneticVariation": "", "transitionAltitudeFt": None, "source": "NATS UK AIP (partial)", "features": features},
        "provider": "NATS UK AIP", "sourceUrl": source_url, "effectiveDate": effective_date,
        "attribution": "UK Aeronautical Information Service / NATS",
        "license": "For aviation use only; not for resale. See NATS UK Digital Dataset Specification.",
        "coverage": "Current BASELINE airport reference point and threshold-to-threshold runway lines only; thresholds may be displaced. Temporary changes and other AIP classes are not imported; not a complete AMDB.",
        "skippedRunways": skipped,
        "raw": {"airport": xml([airport]), "runways": xml([record[0] for record in runways.values()]),
                "directions": xml([record[0] for record in directions.values()]), "thresholds": xml(raw_points)},
    }


def fetch_airport(icao: str) -> dict:
    now = datetime.now(timezone.utc)
    try:
        page = download(PAGE_URL).decode("utf-8")
    except UnicodeError as error:
        raise FeedError("NATS dataset page is not valid UTF-8") from error
    url, effective_date = current_archive_url(page, now)
    return parse_archive(download(url), icao, url, effective_date, now)

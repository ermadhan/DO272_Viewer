"""Import the non-authoritative OurAirports airport and runway subset."""

import csv
import hashlib
import io
import math
from urllib.error import URLError
from urllib.request import Request, urlopen

from faa_nasr import FeedError

BASE_URL = "https://davidmegginson.github.io/ourairports-data/"
MAX_DOWNLOAD = 32 * 1024 * 1024


def download(name: str) -> bytes:
    try:
        with urlopen(Request(BASE_URL + name, headers={"User-Agent": "DO272-Viewer/1.0"}), timeout=60) as response:
            data = response.read(MAX_DOWNLOAD + 1)
    except (URLError, TimeoutError, OSError) as error:
        raise FeedError(f"OurAirports {name} could not be downloaded: {error}") from error
    if len(data) > MAX_DOWNLOAD:
        raise FeedError(f"OurAirports {name} exceeds the download size limit")
    return data


def _number(value: str | None, field: str) -> float | None:
    if not value:
        return None
    try:
        number = float(value)
    except ValueError as error:
        raise FeedError(f"Invalid OurAirports {field}: {value}") from error
    if not math.isfinite(number):
        raise FeedError(f"Invalid OurAirports {field}: {value}")
    return number


def _point(lat: str | None, lon: str | None) -> list[float] | None:
    latitude = _number(lat, "latitude")
    longitude = _number(lon, "longitude")
    if latitude is None or longitude is None:
        return None
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise FeedError("OurAirports coordinates are out of range")
    return [latitude, longitude]


def parse_data(airports_data: bytes, runways_data: bytes, icao: str) -> dict:
    airport_fields = {"id", "icao_code", "iata_code", "name", "municipality", "iso_country",
                      "latitude_deg", "longitude_deg", "elevation_ft"}
    runway_fields = {"id", "airport_ref", "le_ident", "he_ident", "le_latitude_deg",
                     "le_longitude_deg", "he_latitude_deg", "he_longitude_deg",
                     "closed", "length_ft", "width_ft"}
    try:
        airports = csv.DictReader(io.StringIO(airports_data.decode("utf-8-sig"), newline=""))
        if not airport_fields.issubset(airports.fieldnames or []):
            raise FeedError("OurAirports airport CSV is missing required columns")
        matches = []
        for row in airports:
            if row["icao_code"] is None:
                raise FeedError("OurAirports airport CSV contains an incomplete row")
            if row["icao_code"].strip().upper() == icao:
                matches.append(row)
        if len(matches) != 1:
            raise FeedError(f"OurAirports returned {len(matches)} airport records for {icao}")
        airport = matches[0]
        runways = csv.DictReader(io.StringIO(runways_data.decode("utf-8-sig"), newline=""))
        if not runway_fields.issubset(runways.fieldnames or []):
            raise FeedError("OurAirports runway CSV is missing required columns")
        runway_rows = []
        for row in runways:
            if row["airport_ref"] is None:
                raise FeedError("OurAirports runway CSV contains an incomplete row")
            if row["airport_ref"] == airport["id"]:
                runway_rows.append(row)
    except (UnicodeError, csv.Error, KeyError) as error:
        raise FeedError(f"Invalid OurAirports CSV: {error}") from error

    if any(airport.get(field) is None for field in airport_fields) or any(
        row.get(field) is None for row in runway_rows for field in runway_fields
    ):
        raise FeedError("OurAirports CSV contains an incomplete airport or runway row")
    center = _point(airport["latitude_deg"], airport["longitude_deg"])
    if center is None:
        raise FeedError(f"OurAirports reference point is missing for {icao}")
    features, skipped = [], []
    seen = set()
    for row in runway_rows:
        identifier = row["id"].strip()
        if not identifier or identifier in seen:
            raise FeedError("OurAirports runway identifier is missing or duplicated")
        seen.add(identifier)
        designator = "/".join(value for value in (row["le_ident"].strip(), row["he_ident"].strip()) if value)
        low = _point(row["le_latitude_deg"], row["le_longitude_deg"])
        high = _point(row["he_latitude_deg"], row["he_longitude_deg"])
        if low is None or high is None or low == high:
            skipped.append(designator or identifier)
            continue
        feature = {
            "id": f"OurAirports-RWY-{identifier}", "aerodromeId": icao,
            "featureClass": "RunwayElement", "designator": designator,
            "status": "Closed" if row["closed"] == "1" else "Unknown",
            "geometryType": "LineString", "coordinates": [low, high],
            "properties": {"source": "OurAirports", "ourAirportsRunwayId": identifier},
        }
        for field, key in (("length_ft", "lengthMeters"), ("width_ft", "widthMeters")):
            value = _number(row[field], field)
            if value is not None:
                if value < 0:
                    raise FeedError(f"Invalid OurAirports {field}: {row[field]}")
                feature[key] = round(value * 0.3048, 3)
        features.append(feature)

    elevation = _number(airport["elevation_ft"], "elevation_ft")
    return {
        "dataset": {
            "icao": icao, "iata": airport["iata_code"], "name": airport["name"],
            "city": airport["municipality"], "country": airport["iso_country"], "center": center,
            "elevationMeters": round(elevation * 0.3048, 3) if elevation is not None else None,
            "magneticVariation": "", "transitionAltitudeFt": None,
            "source": "OurAirports community (partial)", "features": features,
        },
        "provider": "OurAirports community",
        "sourceUrl": "https://github.com/davidmegginson/ourairports-data",
        "dataUrls": [BASE_URL + "airports.csv", BASE_URL + "runways.csv"],
        "sourceHashes": {"airportsSha256": hashlib.sha256(airports_data).hexdigest(),
                         "runwaysSha256": hashlib.sha256(runways_data).hexdigest()},
        "effectiveDate": None,
        "attribution": "OurAirports contributors",
        "license": "Public domain (Unlicense); no warranty.",
        "coverage": "Community-maintained airport metadata and runway endpoint lines only; not an official AIP or complete AMDB. Source currency and accuracy are not verified.",
        "skippedRunways": skipped,
        "raw": {"airport": airport, "runways": runway_rows},
    }


def fetch_airport(icao: str) -> dict:
    return parse_data(download("airports.csv"), download("runways.csv"), icao)

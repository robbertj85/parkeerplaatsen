#!/usr/bin/env python3
"""
Fetch Apeldoorn parking data from SPDP v2 and OSM.

Combines RDW SPDP data with OpenStreetMap for comprehensive coverage.
"""

import json
import requests
from datetime import datetime, timezone
from pathlib import Path
import time

SPDP_INDEX_URL = "https://npropendata.rdw.nl/parkingdata/v2"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

SCRIPT_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPT_DIR.parent / "car-parking-map" / "public"

HEADERS = {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
}


def fetch_osm_parking():
    """Fetch parking garages from OpenStreetMap for Apeldoorn."""
    print("Fetching parking data from OpenStreetMap...")

    query = """
    [out:json][timeout:60];
    area[name="Apeldoorn"][admin_level=8]->.a;
    (
      nwr["amenity"="parking"]["parking"~"multi-storey|underground"](area.a);
      nwr["amenity"="parking"]["name"~"[Gg]arage|P1|Q-Park"](area.a);
    );
    out center;
    """

    response = requests.post(OVERPASS_URL, data={"data": query}, timeout=60)
    response.raise_for_status()
    data = response.json()

    elements = data.get("elements", [])
    print(f"  Found {len(elements)} OSM parking facilities")
    return elements


def fetch_spdp_apeldoorn():
    """Fetch Apeldoorn facilities from SPDP v2."""
    print("Fetching SPDP v2 index...")
    response = requests.get(SPDP_INDEX_URL, headers=HEADERS, timeout=30)
    response.raise_for_status()
    data = response.json()

    facilities = data.get("ParkingFacilities", [])
    apeldoorn = [f for f in facilities if "apeldoorn" in f.get("name", "").lower()]
    print(f"  Found {len(apeldoorn)} SPDP Apeldoorn facilities")
    return apeldoorn


def fetch_spdp_static(uuid):
    """Fetch static data for a specific facility."""
    url = f"{SPDP_INDEX_URL}/static/{uuid}"
    try:
        response = requests.get(url, headers=HEADERS, timeout=15)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        return None


def classify_type(name, tags=None):
    """Classify parking type."""
    name_lower = name.lower()
    if tags:
        parking = tags.get("parking", "")
        if parking in ["multi-storey", "underground"]:
            return "garage"

    if "p+r" in name_lower or "p&r" in name_lower:
        return "p_and_r"
    if "garage" in name_lower or name.startswith("APELDOORN-"):
        return "garage"
    if "p1" in name_lower:
        return "garage"
    if "terrein" in name_lower:
        return "surface"
    return "surface"


def create_feature(id, name, lat, lon, parking_type, source, **kwargs):
    """Create a GeoJSON feature."""
    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [lon, lat]
        },
        "properties": {
            "id": id,
            "name": name,
            "type": parking_type,
            "latitude": lat,
            "longitude": lon,
            "municipality": "Apeldoorn",
            "province": "Gelderland",
            "source": source,
            "last_updated": datetime.now(timezone.utc).isoformat(),
            **kwargs
        }
    }


def main():
    print("=" * 60)
    print("Apeldoorn Combined Parking Data Fetcher")
    print("=" * 60)

    features = []
    seen_coords = set()  # Dedupe by coordinates

    # 1. Fetch SPDP data with coordinates
    spdp_facilities = fetch_spdp_apeldoorn()

    garages_with_realtime = [
        f for f in spdp_facilities
        if f.get("dynamicDataUrl") and (
            f.get("name", "").startswith("APELDOORN-") or
            "garage" in f.get("name", "").lower() or
            "p+r" in f.get("name", "").lower()
        )
    ]

    print(f"\nProcessing {len(garages_with_realtime)} SPDP garages with real-time data...")

    for facility in garages_with_realtime:
        name = facility.get("name", "")
        uuid = facility.get("identifier", "")

        static = fetch_spdp_static(uuid)
        if not static:
            continue

        info = static.get("parkingFacilityInformation", {})
        loc = info.get("locationForDisplay", {})
        lat = loc.get("latitude")
        lon = loc.get("longitude")

        if not lat or not lon:
            continue

        coord_key = f"{round(lat, 4)},{round(lon, 4)}"
        if coord_key in seen_coords:
            continue
        seen_coords.add(coord_key)

        specs = info.get("specifications", [])
        capacity = specs[0].get("capacity") if specs else None
        max_height = specs[0].get("minimumHeightInMeters") if specs else None

        op = info.get("operator", {})
        operator = op.get("name", "")

        feature = create_feature(
            id=f"spdp-{uuid[:8]}",
            name=name,
            lat=lat,
            lon=lon,
            parking_type=classify_type(name),
            source="rdw",
            uuid=uuid,
            has_realtime=True,
            realtime_url=facility.get("dynamicDataUrl"),
            capacity={"total": capacity} if capacity else None,
            operator=operator,
            max_height=int(max_height * 100) if max_height else None,
            is_qpark="q-park" in operator.lower() if operator else False,
        )
        features.append(feature)
        print(f"  + {name} (SPDP, real-time)")
        time.sleep(0.1)

    # 2. Fetch OSM data
    osm_elements = fetch_osm_parking()

    print(f"\nProcessing OSM parking facilities...")
    for elem in osm_elements:
        tags = elem.get("tags", {})
        name = tags.get("name", "Parkeergarage")

        lat = elem.get("lat") or elem.get("center", {}).get("lat")
        lon = elem.get("lon") or elem.get("center", {}).get("lon")

        if not lat or not lon:
            continue

        coord_key = f"{round(lat, 4)},{round(lon, 4)}"
        if coord_key in seen_coords:
            continue
        seen_coords.add(coord_key)

        parking_type = classify_type(name, tags)
        if parking_type != "garage":
            continue  # Only include garages from OSM

        osm_id = elem.get("id", "")
        capacity = tags.get("capacity")
        operator = tags.get("operator", "")

        feature = create_feature(
            id=f"osm-{osm_id}",
            name=name,
            lat=lat,
            lon=lon,
            parking_type=parking_type,
            source="osm",
            osm_id=str(osm_id),
            has_realtime=False,
            capacity={"total": int(capacity)} if capacity else None,
            operator=operator,
            fee=tags.get("fee"),
            access=tags.get("access"),
        )
        features.append(feature)
        print(f"  + {name} (OSM)")

    # 3. Manually add known garages that are missing
    known_garages = [
        {
            "name": "APELDOORN-Beekstraat",
            "lat": 52.2133831,  # From OSM Q-Park entry
            "lon": 5.9621846,
            "uuid": "cea4cffe-158c-4b08-b940-5d5eefeba089",
            "has_realtime": True,
            "operator": "Q-Park Nederland BV",
            "realtime_url": "https://npropendata.rdw.nl/parkingdata/v2/dynamic/cea4cffe-158c-4b08-b940-5d5eefeba089",
        },
        {
            "name": "P1 Parking Kanaalstraat",
            "lat": 52.2117527,  # From OSM
            "lon": 5.9608153,
            "uuid": "9d44c22e-c1ee-4c05-8ad6-b593308ee6fc",
            "has_realtime": False,
            "operator": "P1",
        },
        {
            "name": "P1 Parkeergarage Marktplein",
            "lat": 52.2155469,  # From OSM
            "lon": 5.9640717,
            "uuid": "56f0c44d-9605-432a-af3d-e900a8bc0146",
            "has_realtime": False,
            "operator": "P1",
            "capacity": {"total": 660},
        },
        {
            "name": "Haven Centrum",
            "lat": 52.2131373,  # From OSM
            "lon": 5.968451,
            "has_realtime": False,
            "operator": "Gemeente Apeldoorn",
            "capacity": {"total": 500},
        },
        {
            "name": "Parkeergarage Brinklaan",
            "lat": 52.2110168,  # From OSM
            "lon": 5.9609452,
            "has_realtime": False,
            "operator": "",
            "capacity": {"total": 240},
        },
    ]

    print(f"\nAdding {len(known_garages)} known garages...")
    for g in known_garages:
        coord_key = f"{round(g['lat'], 4)},{round(g['lon'], 4)}"
        if coord_key in seen_coords:
            print(f"  - {g['name']} (already exists)")
            continue
        seen_coords.add(coord_key)

        feature = create_feature(
            id=f"manual-{g.get('uuid', g['name'])[:8]}",
            name=g["name"],
            lat=g["lat"],
            lon=g["lon"],
            parking_type="garage",
            source="rdw" if g.get("uuid") else "osm",
            uuid=g.get("uuid"),
            has_realtime=g.get("has_realtime", False),
            realtime_url=g.get("realtime_url"),
            capacity=g.get("capacity"),
            operator=g.get("operator", ""),
            is_qpark="q-park" in g.get("operator", "").lower(),
        )
        features.append(feature)
        rt = "🔴" if g.get("has_realtime") else "⚪"
        print(f"  {rt} {g['name']}")

    # Create GeoJSON
    geojson = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "RDW SPDP v2 + OpenStreetMap",
            "municipality": "Apeldoorn",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "total_facilities": len(features),
            "garages": len([f for f in features if f["properties"]["type"] == "garage"]),
            "with_realtime": len([f for f in features if f["properties"].get("has_realtime")]),
            "note": "Q-Park garages have real-time occupancy data available"
        },
        "features": features
    }

    # Save
    output_file = OUTPUT_DIR / "apeldoorn_parking.geojson"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(geojson, f, indent=2, ensure_ascii=False)

    print(f"\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Total facilities: {len(features)}")
    print(f"Garages: {geojson['metadata']['garages']}")
    print(f"With real-time: {geojson['metadata']['with_realtime']}")
    print(f"\nSaved to: {output_file}")

    print("\n=== GARAGES WITH REAL-TIME DATA ===")
    for f in features:
        if f["properties"].get("has_realtime"):
            name = f["properties"]["name"]
            cap = f["properties"].get("capacity", {})
            cap_str = f" ({cap.get('total')} spaces)" if cap and cap.get("total") else ""
            print(f"  🔴 {name}{cap_str}")

    print("\n=== GARAGES WITHOUT REAL-TIME DATA ===")
    for f in features:
        if f["properties"]["type"] == "garage" and not f["properties"].get("has_realtime"):
            name = f["properties"]["name"]
            cap = f["properties"].get("capacity", {})
            cap_str = f" ({cap.get('total')} spaces)" if cap and cap.get("total") else ""
            print(f"  ⚪ {name}{cap_str}")


if __name__ == "__main__":
    main()

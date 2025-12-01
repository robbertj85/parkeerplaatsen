#!/usr/bin/env python3
"""
Fetch individual parking spots for Rotterdam from OSM.
Extracts from the existing OSM data + fetches parking_space data.
"""

import json
import requests
from datetime import datetime, timezone
from pathlib import Path

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Rotterdam bounding box (approximate)
ROTTERDAM_BBOX = {
    "south": 51.85,
    "west": 4.35,
    "north": 52.0,
    "east": 4.65
}


def fetch_overpass_parking_spaces():
    """Fetch individual parking spaces from OSM for Rotterdam."""
    query = f"""
[out:json][timeout:120];
(
  nwr["amenity"="parking_space"]({ROTTERDAM_BBOX['south']},{ROTTERDAM_BBOX['west']},{ROTTERDAM_BBOX['north']},{ROTTERDAM_BBOX['east']});
);
out center;
"""
    print("Fetching Rotterdam parking spaces from OSM...")

    try:
        response = requests.post(
            OVERPASS_URL,
            data={"data": query},
            timeout=180
        )
        response.raise_for_status()
        data = response.json()
        print(f"  Found {len(data.get('elements', []))} parking spaces")
        return data.get("elements", [])
    except Exception as e:
        print(f"  Error: {e}")
        return []


def extract_rotterdam_from_osm():
    """Extract Rotterdam parking from existing OSM data."""
    data_dir = Path(__file__).parent.parent / "data"
    osm_file = data_dir / "osm_parking_nl.json"

    if not osm_file.exists():
        print("OSM data file not found")
        return []

    with open(osm_file) as f:
        data = json.load(f)

    rotterdam = [
        f for f in data["features"]
        if f.get("province") == "Zuid-Holland" and
        ROTTERDAM_BBOX["west"] < f.get("longitude", 0) < ROTTERDAM_BBOX["east"] and
        ROTTERDAM_BBOX["south"] < f.get("latitude", 0) < ROTTERDAM_BBOX["north"]
    ]

    print(f"Extracted {len(rotterdam)} Rotterdam parking from OSM data")
    return rotterdam


def process_parking_space(element: dict) -> dict:
    """Process an OSM parking space element."""
    tags = element.get("tags", {})

    if element["type"] == "node":
        lat = element["lat"]
        lon = element["lon"]
    else:
        center = element.get("center", {})
        lat = center.get("lat")
        lon = center.get("lon")

    if not lat or not lon:
        return None

    return {
        "id": f"osm_space_{element['type']}_{element['id']}",
        "osm_id": element["id"],
        "source": "osm",
        "name": tags.get("name", tags.get("ref", "")),
        "type": "parking_space",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "latitude": lat,
        "longitude": lon,
        "municipality": "Rotterdam",
        "province": "Zuid-Holland",
        "capacity": {"total": int(tags.get("capacity", 1))} if tags.get("capacity") else {"total": 1},
        "is_paid": tags.get("fee", "unknown") != "no",
        "access": tags.get("access", "yes"),
        "last_updated": datetime.now(timezone.utc).isoformat()
    }


def main():
    output_dir = Path(__file__).parent.parent / "data"
    public_dir = Path(__file__).parent.parent / "car-parking-map" / "public"

    # Extract Rotterdam parking from existing OSM data
    rotterdam_parking = extract_rotterdam_from_osm()

    # Fetch individual parking spaces
    parking_spaces_raw = fetch_overpass_parking_spaces()

    # Process parking spaces
    parking_spaces = []
    for elem in parking_spaces_raw:
        processed = process_parking_space(elem)
        if processed:
            parking_spaces.append(processed)

    print(f"Processed {len(parking_spaces)} individual parking spaces")

    # Combine all Rotterdam parking
    all_rotterdam = rotterdam_parking + parking_spaces

    # Remove duplicates by ID
    seen = set()
    unique = []
    for f in all_rotterdam:
        if f["id"] not in seen:
            seen.add(f["id"])
            unique.append(f)

    print(f"Total unique Rotterdam parking: {len(unique)}")

    # Generate statistics
    stats = {
        "total": len(unique),
        "by_type": {},
        "parking_areas": len(rotterdam_parking),
        "parking_spaces": len(parking_spaces),
    }

    for f in unique:
        t = f.get("type", "other")
        stats["by_type"][t] = stats["by_type"].get(t, 0) + 1

    print(f"\n=== Rotterdam Parking Summary ===")
    print(f"Total: {stats['total']}")
    print(f"Parking areas: {stats['parking_areas']}")
    print(f"Individual spaces: {stats['parking_spaces']}")
    print(f"By type:")
    for t, c in sorted(stats["by_type"].items(), key=lambda x: -x[1]):
        print(f"  {t}: {c}")

    # Save to data folder
    output_file = output_dir / "rotterdam_parkeervakken.json"
    output = {
        "metadata": {
            "source": "OpenStreetMap",
            "city": "Rotterdam",
            "province": "Zuid-Holland",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "stats": stats
        },
        "features": unique
    }

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\nData saved to {output_file}")

    # Save GeoJSON to public folder
    geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": f["id"],
                "geometry": f["geometry"],
                "properties": {k: v for k, v in f.items() if k != "geometry"}
            }
            for f in unique
            if f.get("geometry")
        ]
    }

    geojson_file = public_dir / "rotterdam_parking.geojson"
    with open(geojson_file, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False)

    print(f"GeoJSON saved to {geojson_file}")

    return stats


if __name__ == "__main__":
    main()

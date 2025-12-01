#!/usr/bin/env python3
"""
Fetch car parking data from OpenStreetMap for the Netherlands using Overpass API.
Uses province-by-province queries to avoid timeouts.
"""

import json
import requests
import time
from datetime import datetime, timezone
from pathlib import Path

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Dutch provinces with their Overpass area IDs
PROVINCES = [
    ("Groningen", 47540),
    ("Friesland", 47381),
    ("Drenthe", 47540),  # Will use name-based query
    ("Overijssel", 47608),
    ("Flevoland", 47407),
    ("Gelderland", 47554),
    ("Utrecht", 47667),
    ("Noord-Holland", 47654),
    ("Zuid-Holland", 47772),
    ("Zeeland", 47806),
    ("Noord-Brabant", 47696),
    ("Limburg", 47793),
]


def fetch_overpass(query: str, description: str, retries: int = 3) -> dict:
    """Execute an Overpass API query with retries."""
    print(f"Fetching {description}...")

    for attempt in range(retries):
        try:
            response = requests.post(
                OVERPASS_URL,
                data={"data": query},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=180
            )

            if response.status_code == 429:
                wait_time = 60 * (attempt + 1)
                print(f"  Rate limited, waiting {wait_time}s...")
                time.sleep(wait_time)
                continue

            if response.status_code != 200:
                print(f"  Error: HTTP {response.status_code}")
                if attempt < retries - 1:
                    time.sleep(30)
                    continue
                return {"elements": []}

            data = response.json()
            print(f"  Found {len(data.get('elements', []))} elements")
            return data

        except requests.exceptions.Timeout:
            print(f"  Timeout (attempt {attempt + 1}/{retries})")
            if attempt < retries - 1:
                time.sleep(30)
        except Exception as e:
            print(f"  Error: {e}")
            if attempt < retries - 1:
                time.sleep(30)

    return {"elements": []}


def get_province_query(province_name: str) -> str:
    """Generate Overpass query for parking in a province."""
    return f"""
[out:json][timeout:120];
area["name"="{province_name}"]["admin_level"="4"]->.prov;
(
  nwr["amenity"="parking"](area.prov);
);
out center;
"""


def classify_parking_type(tags: dict) -> str:
    """Classify parking type based on OSM tags."""
    parking = tags.get("parking", "")
    amenity = tags.get("amenity", "")

    if parking in ["multi-storey", "underground"]:
        return "garage"
    elif parking == "surface":
        return "surface"
    elif parking in ["street_side", "lane"]:
        return "street_paid"
    elif parking == "park_and_ride" or tags.get("park_ride") == "yes":
        return "p_and_r"
    elif amenity == "parking_space":
        return "parking_space"
    else:
        if tags.get("fee") == "no":
            return "street_free"
        return "surface"


def extract_capacity(tags: dict) -> dict:
    """Extract capacity information from tags."""
    capacity = {}

    if "capacity" in tags:
        try:
            capacity["total"] = int(tags["capacity"])
        except (ValueError, TypeError):
            pass

    if "capacity:disabled" in tags:
        try:
            capacity["disabled"] = int(tags["capacity:disabled"])
        except (ValueError, TypeError):
            pass

    if "capacity:charging" in tags:
        try:
            capacity["ev_charging"] = int(tags["capacity:charging"])
        except (ValueError, TypeError):
            pass

    return capacity if capacity else None


def process_element(element: dict, province: str) -> dict:
    """Process a single OSM element into our parking format."""
    tags = element.get("tags", {})

    # Get coordinates
    if element["type"] == "node":
        lat = element["lat"]
        lon = element["lon"]
    else:
        center = element.get("center", {})
        lat = center.get("lat", element.get("lat", 0))
        lon = center.get("lon", element.get("lon", 0))

    if not lat or not lon:
        return None

    parking_type = classify_parking_type(tags)
    capacity = extract_capacity(tags)

    fee = tags.get("fee", "unknown")
    is_paid = fee == "yes" or (fee == "unknown" and parking_type == "garage")

    return {
        "id": f"osm_{element['type']}_{element['id']}",
        "osm_id": element["id"],
        "osm_type": element["type"],
        "source": "osm",
        "name": tags.get("name", tags.get("description", "")),
        "type": parking_type,
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "latitude": lat,
        "longitude": lon,
        "province": province,
        "capacity": capacity,
        "is_paid": is_paid,
        "fee": fee,
        "access": tags.get("access", "yes"),
        "operator": tags.get("operator", ""),
        "opening_hours": tags.get("opening_hours", ""),
        "surface": tags.get("surface", ""),
        "covered": tags.get("covered", "") == "yes",
        "lit": tags.get("lit", "") == "yes",
        "wheelchair": tags.get("wheelchair", ""),
        "maxstay": tags.get("maxstay", ""),
        "last_updated": datetime.now(timezone.utc).isoformat()
    }


def main():
    output_dir = Path(__file__).parent.parent / "data"
    output_dir.mkdir(exist_ok=True)

    all_parking = []
    seen_ids = set()

    for province_name, _ in PROVINCES:
        query = get_province_query(province_name)
        data = fetch_overpass(query, f"parking in {province_name}")

        for element in data.get("elements", []):
            elem_id = f"{element['type']}_{element['id']}"
            if elem_id in seen_ids:
                continue
            seen_ids.add(elem_id)

            try:
                processed = process_element(element, province_name)
                if processed:
                    all_parking.append(processed)
            except Exception as e:
                print(f"Error processing element {element.get('id')}: {e}")

        # Rate limiting between provinces
        print("Waiting 5 seconds before next province...")
        time.sleep(5)

    # Generate statistics
    stats = {
        "total": len(all_parking),
        "by_type": {},
        "by_province": {},
        "with_capacity": 0,
        "with_name": 0,
    }

    for p in all_parking:
        ptype = p["type"]
        stats["by_type"][ptype] = stats["by_type"].get(ptype, 0) + 1

        province = p.get("province", "Unknown")
        stats["by_province"][province] = stats["by_province"].get(province, 0) + 1

        if p["capacity"]:
            stats["with_capacity"] += 1
        if p["name"]:
            stats["with_name"] += 1

    print(f"\n=== OSM Parking Data Summary ===")
    print(f"Total parking locations: {stats['total']}")
    print(f"By type:")
    for ptype, count in sorted(stats["by_type"].items(), key=lambda x: -x[1]):
        print(f"  {ptype}: {count}")
    print(f"By province:")
    for prov, count in sorted(stats["by_province"].items(), key=lambda x: -x[1]):
        print(f"  {prov}: {count}")
    print(f"With capacity data: {stats['with_capacity']}")
    print(f"With name: {stats['with_name']}")

    # Save data
    output_file = output_dir / "osm_parking_nl.json"
    output = {
        "metadata": {
            "source": "OpenStreetMap via Overpass API",
            "country": "Netherlands",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "stats": stats
        },
        "features": all_parking
    }

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\nData saved to {output_file}")

    # GeoJSON version
    geojson_output = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": p["id"],
                "geometry": p["geometry"],
                "properties": {k: v for k, v in p.items() if k != "geometry"}
            }
            for p in all_parking
        ]
    }

    geojson_file = output_dir / "osm_parking_nl.geojson"
    with open(geojson_file, "w", encoding="utf-8") as f:
        json.dump(geojson_output, f, ensure_ascii=False)

    print(f"GeoJSON saved to {geojson_file}")

    return stats


if __name__ == "__main__":
    main()

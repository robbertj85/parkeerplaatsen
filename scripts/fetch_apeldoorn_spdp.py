#!/usr/bin/env python3
"""
Fetch Apeldoorn parking data from RDW SPDP v2 API.

This script retrieves all parking facilities in Apeldoorn from the national
parking register (NPR) via the SPDP 2.0 standard API.
"""

import json
import requests
from datetime import datetime
from pathlib import Path
import time

# SPDP v2 API endpoint
SPDP_INDEX_URL = "https://npropendata.rdw.nl/parkingdata/v2"

# Output paths
SCRIPT_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPT_DIR.parent / "car-parking-map" / "public"
DATA_DIR = SCRIPT_DIR.parent / "data"


# HTTP headers to mimic browser request
HEADERS = {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
}


def fetch_spdp_index():
    """Fetch the main SPDP v2 index with all parking facilities."""
    print("Fetching SPDP v2 index...")
    response = requests.get(SPDP_INDEX_URL, headers=HEADERS, timeout=30)
    response.raise_for_status()
    return response.json()


def fetch_static_data(uuid):
    """Fetch static data for a specific parking facility."""
    url = f"{SPDP_INDEX_URL}/static/{uuid}"
    try:
        response = requests.get(url, headers=HEADERS, timeout=15)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"  Warning: Could not fetch static data for {uuid}: {e}")
        return None


def classify_parking_type(name, facility_data=None):
    """Classify parking type based on name and data."""
    name_lower = name.lower()

    # Check specifications if available
    usage = ""
    if facility_data:
        specs = facility_data.get("parkingFacilityInformation", {}).get("specifications", [])
        if specs:
            usage = specs[0].get("usage", "").lower()

    if "garage" in name_lower or "garage" in usage:
        return "garage"
    elif "p+r" in name_lower or "p-r" in name_lower or "p&r" in name_lower:
        return "p_and_r"
    elif "p1 parking" in name_lower:
        return "garage"  # P1 are garages
    elif "carpool" in name_lower:
        return "p_and_r"  # Carpool spots similar to P+R
    elif "straatparkeren" in name_lower or "zone" in name_lower:
        return "street_paid"
    elif "p-terrein" in name_lower or "terrein" in name_lower:
        return "surface"
    elif name.startswith("APELDOORN-"):
        return "garage"  # Q-Park garages use this format
    else:
        return "surface"  # Default for street locations


def convert_to_geojson_feature(facility, static_data=None):
    """Convert a parking facility to GeoJSON feature format."""
    name = facility.get("name", "Unknown")
    uuid = facility.get("identifier", "")
    has_dynamic = facility.get("dynamicDataUrl") is not None

    # Get location from static data or use defaults
    lat = None
    lng = None
    capacity = None
    operator = None
    address = None
    opening_hours = None
    max_height = None

    if static_data:
        info = static_data.get("parkingFacilityInformation", {})

        # Location
        loc = info.get("locationForDisplay", {})
        lat = loc.get("latitude")
        lng = loc.get("longitude")

        # Specifications
        specs = info.get("specifications", [])
        if specs:
            spec = specs[0]
            capacity = spec.get("capacity")
            max_height_m = spec.get("minimumHeightInMeters")
            if max_height_m:
                max_height = int(max_height_m * 100)  # Convert to cm

        # Operator
        op = info.get("operator", {})
        if op:
            operator = op.get("name")

        # Access points for address
        access_points = info.get("accessPoints", [])
        if access_points:
            addr = access_points[0].get("accessPointAddress", {})
            if addr:
                street = addr.get("streetName", "")
                city = addr.get("city", "")
                if street:
                    address = f"{street}, {city}" if city else street

        # Opening hours
        opening_times = info.get("openingTimes", [])
        if opening_times:
            if opening_times[0].get("openAllYear"):
                opening_hours = "24/7"

    # Skip if no coordinates
    if not lat or not lng:
        return None

    parking_type = classify_parking_type(name, static_data)

    # Determine if it's a Q-Park garage
    is_qpark = operator and "q-park" in operator.lower()
    is_p1 = "p1 parking" in name.lower()

    feature = {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [lng, lat]
        },
        "properties": {
            "id": f"spdp-{uuid[:8]}",
            "name": name,
            "type": parking_type,
            "latitude": lat,
            "longitude": lng,
            "municipality": "Apeldoorn",
            "province": "Gelderland",
            "source": "rdw",
            "uuid": uuid,
            "has_realtime": has_dynamic,
            "capacity": {"total": capacity} if capacity else None,
            "operator": operator,
            "address": address,
            "opening_hours": opening_hours,
            "max_height": max_height,
            "is_qpark": is_qpark,
            "is_p1": is_p1,
            "last_updated": datetime.utcnow().isoformat() + "Z"
        }
    }

    # Add dynamic URL if available
    if has_dynamic:
        feature["properties"]["realtime_url"] = facility.get("dynamicDataUrl")

    return feature


def main():
    print("=" * 60)
    print("Apeldoorn Parking Data Fetcher (SPDP v2)")
    print("=" * 60)

    # Fetch index
    index_data = fetch_spdp_index()
    all_facilities = index_data.get("ParkingFacilities", [])
    print(f"Total facilities in Netherlands: {len(all_facilities)}")

    # Filter Apeldoorn facilities
    apeldoorn_facilities = [
        f for f in all_facilities
        if "apeldoorn" in f.get("name", "").lower()
    ]
    print(f"Apeldoorn facilities found: {len(apeldoorn_facilities)}")

    # Categorize
    garages = []
    with_realtime = []

    for f in apeldoorn_facilities:
        name = f.get("name", "").lower()
        if f.get("dynamicDataUrl"):
            with_realtime.append(f)
        if "garage" in name or f.get("name", "").startswith("APELDOORN-") or "p1 parking" in name:
            garages.append(f)

    print(f"  - Garages: {len(garages)}")
    print(f"  - With real-time data: {len(with_realtime)}")

    # Fetch static data for each facility
    print("\nFetching static data for each facility...")
    features = []
    skipped = 0

    for i, facility in enumerate(apeldoorn_facilities):
        name = facility.get("name", "Unknown")
        uuid = facility.get("identifier", "")

        # Progress indicator
        if (i + 1) % 10 == 0:
            print(f"  Progress: {i + 1}/{len(apeldoorn_facilities)}")

        # Fetch static data
        static_data = fetch_static_data(uuid)

        # Convert to GeoJSON
        feature = convert_to_geojson_feature(facility, static_data)

        if feature:
            features.append(feature)
        else:
            skipped += 1

        # Rate limiting
        time.sleep(0.1)

    print(f"\nProcessed {len(features)} facilities ({skipped} skipped due to missing coordinates)")

    # Create GeoJSON
    geojson = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "RDW SPDP v2 (npropendata.rdw.nl)",
            "municipality": "Apeldoorn",
            "fetched_at": datetime.utcnow().isoformat() + "Z",
            "total_facilities": len(features),
            "with_realtime": len([f for f in features if f["properties"].get("has_realtime")]),
            "garages": len([f for f in features if f["properties"]["type"] == "garage"]),
            "p_and_r": len([f for f in features if f["properties"]["type"] == "p_and_r"]),
            "surface": len([f for f in features if f["properties"]["type"] == "surface"]),
            "street_paid": len([f for f in features if f["properties"]["type"] == "street_paid"]),
        },
        "features": features
    }

    # Save to public folder
    output_file = OUTPUT_DIR / "apeldoorn_parking.geojson"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(geojson, f, indent=2, ensure_ascii=False)

    print(f"\nSaved to: {output_file}")

    # Also save raw data for reference
    raw_file = DATA_DIR / "apeldoorn_spdp_raw.json"
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    with open(raw_file, "w", encoding="utf-8") as f:
        json.dump({
            "fetched_at": datetime.utcnow().isoformat() + "Z",
            "facilities": apeldoorn_facilities
        }, f, indent=2, ensure_ascii=False)

    print(f"Raw data saved to: {raw_file}")

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Total facilities: {len(features)}")
    print(f"With real-time data: {geojson['metadata']['with_realtime']}")
    print(f"Garages: {geojson['metadata']['garages']}")
    print(f"P+R: {geojson['metadata']['p_and_r']}")
    print(f"Surface lots: {geojson['metadata']['surface']}")
    print(f"Street parking: {geojson['metadata']['street_paid']}")

    # List garages with real-time
    print("\nGarages with real-time data:")
    for f in features:
        if f["properties"]["type"] == "garage" and f["properties"].get("has_realtime"):
            name = f["properties"]["name"]
            cap = f["properties"].get("capacity", {})
            cap_str = f" ({cap.get('total')} spaces)" if cap and cap.get("total") else ""
            print(f"  🔴 {name}{cap_str}")

    print("\nGarages without real-time:")
    for f in features:
        if f["properties"]["type"] == "garage" and not f["properties"].get("has_realtime"):
            name = f["properties"]["name"]
            cap = f["properties"].get("capacity", {})
            cap_str = f" ({cap.get('total')} spaces)" if cap and cap.get("total") else ""
            print(f"  ⚪ {name}{cap_str}")


if __name__ == "__main__":
    main()

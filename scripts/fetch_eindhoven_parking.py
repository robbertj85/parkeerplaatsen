#!/usr/bin/env python3
"""
Fetch parking data from Eindhoven Open Data.

Data source:
- Parkeerplaatsen dataset: data.eindhoven.nl
- Contains publicly accessible parking spots along roads and parking lots
"""

import json
import requests
from datetime import datetime, timezone
from pathlib import Path


# Eindhoven Open Data API
EINDHOVEN_API = "https://data.eindhoven.nl/api/explore/v2.1/catalog/datasets/parkeerplaatsen/records"


def fetch_parkeerplaatsen() -> list:
    """Fetch parking locations from Eindhoven Open Data."""
    print("Fetching Eindhoven parkeerplaatsen...")

    all_records = []
    offset = 0
    limit = 100

    try:
        while True:
            params = {
                "limit": limit,
                "offset": offset,
            }
            try:
                response = requests.get(EINDHOVEN_API, params=params, timeout=60)
                response.raise_for_status()
                data = response.json()

                records = data.get("results", [])
                if not records:
                    break

                all_records.extend(records)
                print(f"  Fetched {len(all_records)} records so far...")

                if len(records) < limit:
                    break

                offset += limit
            except requests.exceptions.HTTPError as e:
                # API has a max offset limit, stop fetching but keep collected records
                if response.status_code == 400:
                    print(f"  Reached API offset limit at {offset} records")
                    break
                raise

        print(f"  Total: {len(all_records)} records")

    except requests.exceptions.RequestException as e:
        print(f"  Error fetching data: {e}")
        if not all_records:
            return []
        print(f"  Continuing with {len(all_records)} records collected before error")

    # Process records
    facilities = []
    for record in all_records:
        # Get geometry from geo_point_2d or geo_shape
        geo_point = record.get("geo_point_2d", {})
        lat = geo_point.get("lat")
        lon = geo_point.get("lon")

        if not lat or not lon:
            geo_shape = record.get("geo_shape", {})
            if geo_shape:
                # geo_shape can be a Feature with geometry inside
                geom = geo_shape.get("geometry", geo_shape)
                if geom.get("type") == "Point":
                    coords = geom.get("coordinates", [])
                    if len(coords) >= 2:
                        lon, lat = coords[0], coords[1]

        if not lat or not lon:
            continue

        # Determine parking type from type_en_merk field
        type_merk = (record.get("type_en_merk", "") or "").lower()
        straat = (record.get("straat", "") or "").lower()

        if "garage" in type_merk:
            parking_type = "garage"
        elif "terrein" in type_merk:
            parking_type = "surface"
        elif "gehandicapt" in type_merk or "invalide" in type_merk:
            parking_type = "disabled"
        elif "fiets" in type_merk:
            continue  # Skip bike parking
        else:
            # Default to parking_space for individual spots
            parking_type = "parking_space"

        # Extract capacity from 'aantal' field
        capacity = None
        cap_value = record.get("aantal")
        if cap_value:
            try:
                capacity = {"total": int(cap_value)}
            except (ValueError, TypeError):
                pass

        # Build name from street
        street = record.get("straat", "")
        name = street if street else f"Parkeerplaats Eindhoven"

        facility = {
            "id": f"eindhoven_{record.get('objectid', '')}",
            "source": "eindhoven",
            "source_detail": "Eindhoven Open Data - Parkeerplaatsen",
            "name": name,
            "type": parking_type,
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "latitude": lat,
            "longitude": lon,
            "municipality": "Eindhoven",
            "province": "Noord-Brabant",
            "address": street,
            "capacity": capacity,
            "type_en_merk": record.get("type_en_merk", ""),
            "last_updated": datetime.now(timezone.utc).isoformat()
        }
        facilities.append(facility)

    return facilities


def fetch_parkeergarages() -> list:
    """Try to fetch parking garages specifically from Eindhoven."""
    print("Checking for Eindhoven parking garages dataset...")

    # Alternative endpoint for garages
    garages_api = "https://data.eindhoven.nl/api/explore/v2.1/catalog/datasets/parkeergarages/records"

    try:
        response = requests.get(garages_api, params={"limit": 100}, timeout=30)
        if response.status_code == 200:
            data = response.json()
            records = data.get("results", [])
            print(f"  Found {len(records)} parking garages")

            garages = []
            for record in records:
                geo_point = record.get("geo_point_2d", {})
                lat = geo_point.get("lat")
                lon = geo_point.get("lon")

                if not lat or not lon:
                    continue

                capacity = None
                cap_value = record.get("capaciteit") or record.get("aantal_plaatsen")
                if cap_value:
                    try:
                        capacity = {"total": int(cap_value)}
                    except (ValueError, TypeError):
                        pass

                garage = {
                    "id": f"eindhoven_garage_{record.get('id', '')}",
                    "source": "eindhoven",
                    "source_detail": "Eindhoven Open Data - Parkeergarages",
                    "name": record.get("naam", record.get("name", "")),
                    "type": "garage",
                    "geometry": {"type": "Point", "coordinates": [lon, lat]},
                    "latitude": lat,
                    "longitude": lon,
                    "municipality": "Eindhoven",
                    "province": "Noord-Brabant",
                    "address": record.get("adres", record.get("straat", "")),
                    "capacity": capacity,
                    "operator": record.get("exploitant", record.get("beheerder", "")),
                    "is_paid": True,
                    "last_updated": datetime.now(timezone.utc).isoformat()
                }
                garages.append(garage)

            return garages
        else:
            print(f"  Garages dataset not available (HTTP {response.status_code})")
            return []

    except requests.exceptions.RequestException as e:
        print(f"  Error: {e}")
        return []


def main():
    output_dir = Path(__file__).parent.parent / "data"
    output_dir.mkdir(exist_ok=True)

    all_facilities = []

    # Fetch main parking dataset
    parkeerplaatsen = fetch_parkeerplaatsen()
    all_facilities.extend(parkeerplaatsen)

    # Try to fetch garages separately
    garages = fetch_parkeergarages()
    if garages:
        # Avoid duplicates by checking proximity
        for garage in garages:
            is_duplicate = False
            for existing in all_facilities:
                if (abs(garage["latitude"] - existing["latitude"]) < 0.0001 and
                    abs(garage["longitude"] - existing["longitude"]) < 0.0001):
                    is_duplicate = True
                    break
            if not is_duplicate:
                all_facilities.append(garage)

    # Generate statistics
    stats = {
        "total": len(all_facilities),
        "by_type": {},
        "with_capacity": 0,
    }

    for f in all_facilities:
        ptype = f["type"]
        stats["by_type"][ptype] = stats["by_type"].get(ptype, 0) + 1

        if f.get("capacity"):
            stats["with_capacity"] += 1

    print(f"\n=== Eindhoven Parking Data Summary ===")
    print(f"Total facilities: {stats['total']}")
    print(f"By type:")
    for ptype, count in sorted(stats["by_type"].items(), key=lambda x: -x[1]):
        print(f"  {ptype}: {count}")
    print(f"With capacity: {stats['with_capacity']}")

    # Save data
    output_file = output_dir / "eindhoven_parking.json"
    output = {
        "metadata": {
            "source": "Eindhoven Open Data - Parkeerplaatsen",
            "city": "Eindhoven",
            "province": "Noord-Brabant",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "stats": stats
        },
        "features": all_facilities
    }

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\nData saved to {output_file}")

    # Create GeoJSON
    geojson_output = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": f["id"],
                "geometry": f["geometry"],
                "properties": {k: v for k, v in f.items() if k != "geometry"}
            }
            for f in all_facilities
            if f["geometry"]
        ]
    }

    geojson_file = output_dir / "eindhoven_parking.geojson"
    with open(geojson_file, "w", encoding="utf-8") as f:
        json.dump(geojson_output, f, ensure_ascii=False)

    print(f"GeoJSON saved to {geojson_file}")

    return stats


if __name__ == "__main__":
    main()

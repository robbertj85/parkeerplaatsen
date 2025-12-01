#!/usr/bin/env python3
"""
Fetch individual parking spots (parkeervakken) from Amsterdam Open Data.
This is the most detailed street parking dataset in the Netherlands.

Note: Since Feb 2024, Amsterdam requires an API key.
For now, we use the public WFS endpoints that still work for bulk downloads.
"""

import json
import requests
from datetime import datetime
from pathlib import Path
from typing import Optional
import time

# Amsterdam data endpoints
AMSTERDAM_WFS = "https://map.data.amsterdam.nl/maps/parkeervakken"

# WFS request parameters for different datasets
WFS_REQUESTS = {
    "all_spots": {
        "REQUEST": "GetFeature",
        "SERVICE": "WFS",
        "VERSION": "1.1.0",
        "TYPENAME": "alle_parkeervakken",
        "OUTPUTFORMAT": "geojson",
        "SRSNAME": "EPSG:4326"
    },
    "fiscal_spots": {
        "REQUEST": "GetFeature",
        "SERVICE": "WFS",
        "VERSION": "1.1.0",
        "TYPENAME": "parkeervakken_fiscaal",
        "OUTPUTFORMAT": "geojson",
        "SRSNAME": "EPSG:4326"
    }
}


def fetch_wfs_data(params: dict, description: str) -> Optional[dict]:
    """Fetch data from Amsterdam WFS service."""
    print(f"Fetching {description}...")

    try:
        response = requests.get(
            AMSTERDAM_WFS,
            params=params,
            timeout=300  # Large dataset, needs time
        )
        response.raise_for_status()

        data = response.json()
        features = data.get("features", [])
        print(f"  Found {len(features)} features")
        return data

    except requests.exceptions.RequestException as e:
        print(f"  Error: {e}")
        return None


def classify_spot_type(properties: dict) -> str:
    """Classify parking spot type based on properties."""
    spot_type = properties.get("type", "").upper()
    soort = properties.get("soort", "").lower()
    e_type = properties.get("e_type", "")

    # Check for disabled parking
    if spot_type == "MULDER" or "gehandicapt" in soort:
        return "disabled"

    # Check for EV charging
    if e_type and "E" in str(e_type).upper():
        return "ev_charging"

    # Check for loading zones
    if "laden" in soort or "lossen" in soort:
        return "loading_zone"

    # Check for permit parking
    if "vergunning" in soort:
        return "permit"

    # Fiscal = paid parking
    if spot_type == "FISCAAL":
        return "street_paid"

    return "street_paid"  # Default for Amsterdam (mostly paid)


def process_feature(feature: dict) -> dict:
    """Process a single parking spot feature."""
    props = feature.get("properties", {})
    geometry = feature.get("geometry", {})

    # Get coordinates (centroid for polygons)
    coords = geometry.get("coordinates", [])
    lat, lon = None, None

    if geometry.get("type") == "Point":
        lon, lat = coords[0], coords[1] if len(coords) >= 2 else (None, None)
    elif geometry.get("type") == "Polygon" and coords:
        # Calculate centroid of polygon
        ring = coords[0] if coords else []
        if ring:
            lons = [p[0] for p in ring]
            lats = [p[1] for p in ring]
            lon = sum(lons) / len(lons)
            lat = sum(lats) / len(lats)
    elif geometry.get("type") == "MultiPolygon" and coords:
        # Use first polygon's centroid
        ring = coords[0][0] if coords and coords[0] else []
        if ring:
            lons = [p[0] for p in ring]
            lats = [p[1] for p in ring]
            lon = sum(lons) / len(lons)
            lat = sum(lats) / len(lats)

    spot_type = classify_spot_type(props)

    # Extract number of spots (vaak 1, soms meer)
    aantal = props.get("aantal", 1)
    try:
        aantal = int(aantal)
    except:
        aantal = 1

    return {
        "id": f"ams_{props.get('id', props.get('volgnummer', ''))}",
        "source": "amsterdam",
        "name": props.get("straatnaam", ""),
        "type": spot_type,
        "geometry": geometry,
        "latitude": lat,
        "longitude": lon,
        "municipality": "Amsterdam",
        "province": "Noord-Holland",
        "capacity": {"total": aantal} if aantal else None,
        "spot_count": aantal,
        "is_paid": spot_type in ["street_paid", "permit"],
        "fiscal_type": props.get("type", ""),
        "soort": props.get("soort", ""),
        "e_type": props.get("e_type", ""),
        "buurtcode": props.get("buurtcode", ""),
        "straatnaam": props.get("straatnaam", ""),
        "last_updated": datetime.utcnow().isoformat() + "Z"
    }


def main():
    output_dir = Path(__file__).parent.parent / "data"
    output_dir.mkdir(exist_ok=True)

    all_spots = []

    # Fetch all parking spots
    all_data = fetch_wfs_data(WFS_REQUESTS["all_spots"], "all parking spots")

    if all_data:
        for feature in all_data.get("features", []):
            try:
                processed = process_feature(feature)
                if processed["latitude"] and processed["longitude"]:
                    all_spots.append(processed)
            except Exception as e:
                print(f"Error processing feature: {e}")

    # Generate statistics
    stats = {
        "total": len(all_spots),
        "total_capacity": sum(s.get("spot_count", 1) for s in all_spots),
        "by_type": {},
        "by_soort": {},
    }

    for s in all_spots:
        stype = s["type"]
        stats["by_type"][stype] = stats["by_type"].get(stype, 0) + 1

        soort = s.get("soort", "unknown")
        if soort:
            stats["by_soort"][soort] = stats["by_soort"].get(soort, 0) + 1

    print(f"\n=== Amsterdam Parking Spots Summary ===")
    print(f"Total spot areas: {stats['total']}")
    print(f"Total parking capacity: {stats['total_capacity']}")
    print(f"By type:")
    for stype, count in sorted(stats["by_type"].items(), key=lambda x: -x[1]):
        print(f"  {stype}: {count}")
    print(f"Top 10 'soort' categories:")
    for soort, count in sorted(stats["by_soort"].items(), key=lambda x: -x[1])[:10]:
        print(f"  {soort}: {count}")

    # Save data
    output_file = output_dir / "amsterdam_parkeervakken.json"
    output = {
        "metadata": {
            "source": "Amsterdam Open Data - Parkeervakken",
            "city": "Amsterdam",
            "province": "Noord-Holland",
            "fetched_at": datetime.utcnow().isoformat() + "Z",
            "stats": stats
        },
        "features": all_spots
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
                "id": s["id"],
                "geometry": s["geometry"],
                "properties": {k: v for k, v in s.items() if k != "geometry"}
            }
            for s in all_spots
            if s["geometry"]
        ]
    }

    geojson_file = output_dir / "amsterdam_parkeervakken.geojson"
    with open(geojson_file, "w", encoding="utf-8") as f:
        json.dump(geojson_output, f, ensure_ascii=False)

    print(f"GeoJSON saved to {geojson_file}")

    return stats


if __name__ == "__main__":
    main()

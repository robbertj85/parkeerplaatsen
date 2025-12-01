#!/usr/bin/env python3
"""
Fetch parking garage data from RDW Open Data (opendata.rdw.nl) via Socrata API.
"""

import json
import requests
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# RDW Open Data Socrata API
RDW_BASE = "https://opendata.rdw.nl/resource"

# Key datasets
DATASETS = {
    "parking_areas": "adw6-9hsg",       # Parking areas (GEBIED)
    "parking_address": "ygq4-hh5q",     # Parking addresses
    "parking_specs": "b3us-f26s",       # Specifications
    "tariff_parts": "534e-5vdg",        # Tariff parts
    "geo_area": "nsk3-v9n7",            # Geo area with coordinates
}


def fetch_socrata(dataset_id: str, params: Optional[dict] = None) -> list:
    """Fetch data from RDW Socrata API."""
    url = f"{RDW_BASE}/{dataset_id}.json"

    default_params = {"$limit": 50000}
    if params:
        default_params.update(params)

    print(f"Fetching dataset {dataset_id}...")

    try:
        response = requests.get(url, params=default_params, timeout=60)
        response.raise_for_status()
        data = response.json()
        print(f"  Found {len(data)} records")
        return data
    except requests.exceptions.RequestException as e:
        print(f"  Error: {e}")
        return []


def parse_wkt_point(wkt: str) -> tuple:
    """Parse WKT POINT format to (lon, lat)."""
    if not wkt or not wkt.startswith("POINT"):
        return None, None
    try:
        # POINT (lon lat)
        coords = wkt.replace("POINT (", "").replace(")", "").strip()
        lon, lat = coords.split()
        return float(lon), float(lat)
    except:
        return None, None


def main():
    output_dir = Path(__file__).parent.parent / "data"
    output_dir.mkdir(exist_ok=True)

    # Fetch parking areas
    areas = fetch_socrata(DATASETS["parking_areas"])

    # Fetch addresses
    addresses = fetch_socrata(DATASETS["parking_address"])
    addr_lookup = {a.get("areaid"): a for a in addresses}

    # Fetch geo data (with coordinates in WKT format)
    geo_data = fetch_socrata(DATASETS["geo_area"])
    geo_lookup = {}
    for g in geo_data:
        area_id = g.get("areaid")
        if area_id:
            geo_lookup[area_id] = g
            # Also try with areamanagerid prefix
            manager_id = g.get("areamanagerid")
            if manager_id:
                geo_lookup[f"{manager_id}_{area_id}"] = g

    # Fetch specs
    specs = fetch_socrata(DATASETS["parking_specs"])
    specs_lookup = {}
    for s in specs:
        area_id = s.get("areaid")
        if area_id:
            if area_id not in specs_lookup:
                specs_lookup[area_id] = []
            specs_lookup[area_id].append(s)

    all_facilities = []

    for area in areas:
        area_id = area.get("areaid", "")
        manager_id = area.get("areamanagerid", "")
        if not area_id:
            continue

        # Try to find geo data with various ID formats
        geo = (geo_lookup.get(area_id) or
               geo_lookup.get(f"{manager_id}_{area_id}") or
               geo_lookup.get(f"{manager_id}_{area.get('areadesc', '').replace(' ', '_')}") or
               {})

        # Parse WKT POINT from areageometryastext
        wkt = geo.get("areageometryastext", "")
        lon, lat = parse_wkt_point(wkt)

        if not lat or not lon:
            continue

        # Get address
        addr = addr_lookup.get(area_id, {})

        # Get capacity from specs
        capacity = None
        area_specs = specs_lookup.get(area_id, [])
        for spec in area_specs:
            if spec.get("speccode") == "CP":  # Capacity
                try:
                    capacity = {"total": int(spec.get("specificatie", 0))}
                except:
                    pass

        # Determine type
        area_desc = area.get("areadesc", "").lower()
        parking_type = "garage"  # Default

        if "p+r" in area_desc or "park & ride" in area_desc:
            parking_type = "p_and_r"
        elif "terrein" in area_desc or "terrain" in area_desc:
            parking_type = "surface"
        elif "straat" in area_desc:
            parking_type = "street_paid"

        facility = {
            "id": f"rdw_{area_id}",
            "rdw_id": area_id,
            "source": "rdw",
            "name": area.get("areadesc", ""),
            "type": parking_type,
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "latitude": lat,
            "longitude": lon,
            "municipality": addr.get("city", area.get("areamanagerid", "")),
            "address": addr.get("streetname", ""),
            "capacity": capacity,
            "is_paid": True,
            "operator": area.get("areamanagerid", ""),
            "has_realtime": False,
            "last_updated": datetime.now(timezone.utc).isoformat()
        }

        all_facilities.append(facility)

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

    print(f"\n=== RDW Parking Data Summary ===")
    print(f"Total facilities: {stats['total']}")
    print(f"By type:")
    for ptype, count in sorted(stats["by_type"].items(), key=lambda x: -x[1]):
        print(f"  {ptype}: {count}")
    print(f"With capacity data: {stats['with_capacity']}")

    # Save data
    output_file = output_dir / "rdw_parking_nl.json"
    output = {
        "metadata": {
            "source": "RDW Open Data (Socrata)",
            "country": "Netherlands",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "stats": stats
        },
        "features": all_facilities
    }

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\nData saved to {output_file}")

    # GeoJSON
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
        ]
    }

    geojson_file = output_dir / "rdw_parking_nl.geojson"
    with open(geojson_file, "w", encoding="utf-8") as f:
        json.dump(geojson_output, f, ensure_ascii=False)

    print(f"GeoJSON saved to {geojson_file}")

    return stats


if __name__ == "__main__":
    main()

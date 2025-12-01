#!/usr/bin/env python3
"""
Merge parking data focused on specific regions:
- Zuid-Holland (includes Rotterdam)
- Gelderland (includes Elburg)
- Overijssel (includes Zwolle)
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict

# Focus provinces
FOCUS_PROVINCES = {"Zuid-Holland", "Gelderland", "Overijssel"}


def load_json_file(filepath: Path) -> dict:
    """Load JSON file if it exists."""
    if filepath.exists():
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"features": []}


def main():
    data_dir = Path(__file__).parent.parent / "data"
    output_dir = Path(__file__).parent.parent / "car-parking-map" / "public"
    output_dir.mkdir(exist_ok=True)

    # Load data sources
    print("Loading data sources...")

    osm_data = load_json_file(data_dir / "osm_parking_nl.json")
    rdw_data = load_json_file(data_dir / "rdw_parking_nl.json")
    amsterdam_data = load_json_file(data_dir / "amsterdam_parkeervakken.json")

    print(f"  OSM: {len(osm_data.get('features', []))} total")
    print(f"  RDW: {len(rdw_data.get('features', []))} total")
    print(f"  Amsterdam: {len(amsterdam_data.get('features', []))} total")

    # Filter OSM data by province
    osm_filtered = [
        f for f in osm_data.get("features", [])
        if f.get("province") in FOCUS_PROVINCES
    ]
    print(f"  OSM filtered (Zuid-Holland + Gelderland): {len(osm_filtered)}")

    # Combine RDW + filtered OSM
    all_facilities = []

    # Add RDW data (national, no filtering needed for garages)
    for f in rdw_data.get("features", []):
        all_facilities.append(f)

    # Add filtered OSM data
    for f in osm_filtered:
        all_facilities.append(f)

    print(f"\nTotal facilities: {len(all_facilities)}")

    # Generate statistics
    stats = {
        "total": len(all_facilities),
        "by_type": defaultdict(int),
        "by_source": defaultdict(int),
        "by_province": defaultdict(int),
        "with_capacity": 0,
        "with_name": 0,
    }

    for f in all_facilities:
        stats["by_type"][f.get("type", "other")] += 1
        stats["by_source"][f.get("source", "unknown")] += 1

        province = f.get("province", "Unknown")
        if province:
            stats["by_province"][province] += 1

        if f.get("capacity"):
            stats["with_capacity"] += 1
        if f.get("name"):
            stats["with_name"] += 1

    stats["by_type"] = dict(stats["by_type"])
    stats["by_source"] = dict(stats["by_source"])
    stats["by_province"] = dict(stats["by_province"])

    print(f"\n=== Parking Data Summary ===")
    print(f"Total facilities: {stats['total']}")
    print(f"By type:")
    for ptype, count in sorted(stats["by_type"].items(), key=lambda x: -x[1]):
        print(f"  {ptype}: {count}")
    print(f"By source:")
    for src, count in sorted(stats["by_source"].items(), key=lambda x: -x[1]):
        print(f"  {src}: {count}")
    print(f"By province:")
    for prov, count in sorted(stats["by_province"].items(), key=lambda x: -x[1]):
        print(f"  {prov}: {count}")

    # Save merged data
    output = {
        "metadata": {
            "sources": ["OpenStreetMap", "RDW/NPR"],
            "focus_regions": list(FOCUS_PROVINCES),
            "country": "Netherlands",
            "merged_at": datetime.now(timezone.utc).isoformat(),
            "stats": stats
        },
        "features": all_facilities
    }

    output_file = output_dir / "parking_data.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False)

    print(f"\nMerged data saved to {output_file}")

    # Create GeoJSON
    geojson_output = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": f["id"],
                "geometry": f["geometry"],
                "properties": {k: v for k, v in f.items() if k not in ["geometry", "tags"]}
            }
            for f in all_facilities
            if f.get("geometry")
        ]
    }

    geojson_file = output_dir / "parking_data.geojson"
    with open(geojson_file, "w", encoding="utf-8") as f:
        json.dump(geojson_output, f, ensure_ascii=False)

    print(f"GeoJSON saved to {geojson_file}")

    # Also save Amsterdam data (already done)
    print(f"\nAmsterdam data already at: {output_dir / 'amsterdam_parking.geojson'}")

    return stats


if __name__ == "__main__":
    main()

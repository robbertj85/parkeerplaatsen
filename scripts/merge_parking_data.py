#!/usr/bin/env python3
"""
Merge all parking data sources into a single unified dataset.
Handles deduplication and data enrichment.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from math import radians, cos, sin, asin, sqrt
from collections import defaultdict


def haversine(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Calculate distance between two points in meters."""
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    r = 6371000  # Earth's radius in meters
    return c * r


def load_json_file(filepath: Path) -> dict:
    """Load JSON file if it exists."""
    if filepath.exists():
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"features": []}


def normalize_parking_type(facility: dict) -> str:
    """Normalize parking type across different sources."""
    ptype = facility.get("type", "")
    source = facility.get("source", "")

    # Map various type names to standard types
    type_mapping = {
        "garage": "garage",
        "multi-storey": "garage",
        "underground": "garage",
        "surface": "surface",
        "surface_lot": "surface",
        "street_paid": "street_paid",
        "street_free": "street_free",
        "street_side": "street_paid",
        "lane": "street_paid",
        "p_and_r": "p_and_r",
        "park_and_ride": "p_and_r",
        "disabled": "disabled",
        "ev_charging": "ev_charging",
        "loading_zone": "loading_zone",
        "permit": "permit",
        "parking_space": "parking_space",
    }

    return type_mapping.get(ptype, "other")


def find_duplicates(facilities: list, distance_threshold: float = 50) -> dict:
    """Find potential duplicates based on proximity and name similarity."""
    # Group by approximate location (grid cells)
    grid = defaultdict(list)
    cell_size = 0.001  # ~100m cells

    for i, f in enumerate(facilities):
        lat = f.get("latitude")
        lon = f.get("longitude")
        if lat and lon:
            cell = (round(lat / cell_size), round(lon / cell_size))
            grid[cell].append(i)

    # Find duplicates within cells and adjacent cells
    duplicates = {}  # index -> canonical index

    for cell, indices in grid.items():
        # Check within cell and adjacent cells
        nearby_indices = set(indices)
        for dx in [-1, 0, 1]:
            for dy in [-1, 0, 1]:
                adjacent = (cell[0] + dx, cell[1] + dy)
                if adjacent in grid:
                    nearby_indices.update(grid[adjacent])

        nearby_list = sorted(nearby_indices)

        for i, idx1 in enumerate(nearby_list):
            if idx1 in duplicates:
                continue

            f1 = facilities[idx1]
            lat1, lon1 = f1.get("latitude"), f1.get("longitude")

            for idx2 in nearby_list[i+1:]:
                if idx2 in duplicates:
                    continue

                f2 = facilities[idx2]
                lat2, lon2 = f2.get("latitude"), f2.get("longitude")

                if lat1 and lon1 and lat2 and lon2:
                    dist = haversine(lon1, lat1, lon2, lat2)

                    if dist < distance_threshold:
                        # Check name similarity
                        name1 = (f1.get("name") or "").lower()
                        name2 = (f2.get("name") or "").lower()

                        # Consider duplicate if names match or one is empty
                        if (not name1 or not name2 or
                            name1 in name2 or name2 in name1 or
                            name1 == name2):

                            # Keep the one with more data
                            score1 = sum([
                                bool(f1.get("name")),
                                bool(f1.get("capacity")),
                                bool(f1.get("has_realtime")),
                                f1.get("source") == "rdw",  # Prefer official source
                            ])
                            score2 = sum([
                                bool(f2.get("name")),
                                bool(f2.get("capacity")),
                                bool(f2.get("has_realtime")),
                                f2.get("source") == "rdw",
                            ])

                            if score1 >= score2:
                                duplicates[idx2] = idx1
                            else:
                                duplicates[idx1] = idx2

    return duplicates


def merge_facilities(canonical: dict, duplicate: dict) -> dict:
    """Merge data from duplicate into canonical facility."""
    merged = canonical.copy()

    # Prefer non-empty values
    for key in ["name", "operator", "opening_hours", "address", "municipality"]:
        if not merged.get(key) and duplicate.get(key):
            merged[key] = duplicate[key]

    # Merge capacity (prefer higher or more detailed)
    if duplicate.get("capacity"):
        if not merged.get("capacity"):
            merged["capacity"] = duplicate["capacity"]
        elif isinstance(merged["capacity"], dict) and isinstance(duplicate["capacity"], dict):
            for k, v in duplicate["capacity"].items():
                if k not in merged["capacity"]:
                    merged["capacity"][k] = v

    # Prefer real-time data
    if duplicate.get("has_realtime") and not merged.get("has_realtime"):
        merged["has_realtime"] = True
        merged["available"] = duplicate.get("available")
        merged["realtime_updated"] = duplicate.get("realtime_updated")

    # Track all sources
    sources = set([merged.get("source", "")])
    sources.add(duplicate.get("source", ""))
    merged["sources"] = list(sources - {""})

    return merged


def generate_city_statistics(facilities: list) -> dict:
    """Generate parking statistics per municipality."""
    stats = defaultdict(lambda: {
        "total_facilities": 0,
        "total_capacity": 0,
        "by_type": defaultdict(int),
        "with_realtime": 0,
    })

    for f in facilities:
        municipality = f.get("municipality", "Unknown")
        s = stats[municipality]

        s["total_facilities"] += 1

        capacity = f.get("capacity", {})
        if isinstance(capacity, dict):
            s["total_capacity"] += capacity.get("total", 0)
        elif isinstance(capacity, int):
            s["total_capacity"] += capacity

        ptype = f.get("type", "other")
        s["by_type"][ptype] += 1

        if f.get("has_realtime"):
            s["with_realtime"] += 1

    # Convert defaultdicts to regular dicts
    return {k: {**v, "by_type": dict(v["by_type"])} for k, v in stats.items()}


def main():
    data_dir = Path(__file__).parent.parent / "data"
    output_dir = Path(__file__).parent.parent / "car-parking-map" / "public"
    output_dir.mkdir(exist_ok=True)

    # Load all data sources
    print("Loading data sources...")

    osm_data = load_json_file(data_dir / "osm_parking_nl.json")
    rdw_data = load_json_file(data_dir / "rdw_parking_nl.json")
    amsterdam_data = load_json_file(data_dir / "amsterdam_parkeervakken.json")

    print(f"  OSM: {len(osm_data.get('features', []))} facilities")
    print(f"  RDW: {len(rdw_data.get('features', []))} facilities")
    print(f"  Amsterdam: {len(amsterdam_data.get('features', []))} spots")

    # Combine all facilities (excluding Amsterdam individual spots for now - too many)
    all_facilities = []

    # Add OSM data
    for f in osm_data.get("features", []):
        f["type"] = normalize_parking_type(f)
        all_facilities.append(f)

    # Add RDW data
    for f in rdw_data.get("features", []):
        f["type"] = normalize_parking_type(f)
        all_facilities.append(f)

    print(f"\nTotal before deduplication: {len(all_facilities)}")

    # Find and merge duplicates
    duplicates = find_duplicates(all_facilities)
    print(f"Found {len(duplicates)} potential duplicates")

    # Merge duplicates
    canonical_indices = set(range(len(all_facilities))) - set(duplicates.keys())
    merged_facilities = []

    for idx in canonical_indices:
        facility = all_facilities[idx]

        # Find all duplicates of this facility
        dup_indices = [i for i, c in duplicates.items() if c == idx]
        for dup_idx in dup_indices:
            facility = merge_facilities(facility, all_facilities[dup_idx])

        merged_facilities.append(facility)

    print(f"Total after deduplication: {len(merged_facilities)}")

    # Generate statistics
    stats = {
        "total": len(merged_facilities),
        "by_type": defaultdict(int),
        "by_source": defaultdict(int),
        "with_capacity": 0,
        "with_realtime": 0,
        "with_name": 0,
    }

    for f in merged_facilities:
        stats["by_type"][f.get("type", "other")] += 1

        sources = f.get("sources", [f.get("source", "unknown")])
        for src in sources:
            stats["by_source"][src] += 1

        if f.get("capacity"):
            stats["with_capacity"] += 1
        if f.get("has_realtime"):
            stats["with_realtime"] += 1
        if f.get("name"):
            stats["with_name"] += 1

    stats["by_type"] = dict(stats["by_type"])
    stats["by_source"] = dict(stats["by_source"])

    # Generate city statistics
    city_stats = generate_city_statistics(merged_facilities)

    print(f"\n=== Merged Parking Data Summary ===")
    print(f"Total facilities: {stats['total']}")
    print(f"By type:")
    for ptype, count in sorted(stats["by_type"].items(), key=lambda x: -x[1]):
        print(f"  {ptype}: {count}")
    print(f"By source:")
    for src, count in sorted(stats["by_source"].items(), key=lambda x: -x[1]):
        print(f"  {src}: {count}")
    print(f"With capacity: {stats['with_capacity']}")
    print(f"With real-time: {stats['with_realtime']}")
    print(f"With name: {stats['with_name']}")

    # Save merged data
    output = {
        "metadata": {
            "sources": ["OpenStreetMap", "RDW/NPR"],
            "country": "Netherlands",
            "merged_at": datetime.now(timezone.utc).isoformat(),
            "stats": stats
        },
        "features": merged_facilities
    }

    # Save as JSON
    output_file = output_dir / "parking_data.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False)

    print(f"\nMerged data saved to {output_file}")

    # Save city statistics
    city_stats_file = output_dir / "city_statistics.json"
    with open(city_stats_file, "w", encoding="utf-8") as f:
        json.dump(city_stats, f, ensure_ascii=False, indent=2)

    print(f"City statistics saved to {city_stats_file}")

    # Create GeoJSON for map
    geojson_output = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": f["id"],
                "geometry": f["geometry"],
                "properties": {k: v for k, v in f.items() if k not in ["geometry", "tags"]}
            }
            for f in merged_facilities
            if f.get("geometry")
        ]
    }

    geojson_file = output_dir / "parking_data.geojson"
    with open(geojson_file, "w", encoding="utf-8") as f:
        json.dump(geojson_output, f, ensure_ascii=False)

    print(f"GeoJSON saved to {geojson_file}")

    # Also save Amsterdam data separately (for detailed view)
    if amsterdam_data.get("features"):
        amsterdam_geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": f["id"],
                    "geometry": f["geometry"],
                    "properties": {k: v for k, v in f.items() if k not in ["geometry"]}
                }
                for f in amsterdam_data["features"]
                if f.get("geometry")
            ]
        }

        amsterdam_file = output_dir / "amsterdam_parking.geojson"
        with open(amsterdam_file, "w", encoding="utf-8") as f:
            json.dump(amsterdam_geojson, f, ensure_ascii=False)

        print(f"Amsterdam detailed data saved to {amsterdam_file}")

    return stats


if __name__ == "__main__":
    main()

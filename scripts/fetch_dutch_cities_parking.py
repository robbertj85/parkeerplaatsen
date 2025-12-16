#!/usr/bin/env python3
"""
Fetch parking data from multiple Dutch cities.

Data sources:
- Groningen: WFS from maps.groningen.nl
- Arnhem: ArcGIS REST API from geo.arnhem.nl
- Delft: Open data portal
- Hoorn: Open data
- Other cities as available
"""

import json
import requests
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Optional


# City parking data sources
CITY_SOURCES = {
    "groningen": {
        "name": "Groningen",
        "province": "Groningen",
        "type": "wfs",
        "url": "https://maps.groningen.nl/geoserver/geo_info/ows",
        "params": {
            "service": "WFS",
            "version": "1.0.0",
            "request": "GetFeature",
            "typeName": "geo_info:Parkeervakken gemeente Groningen",
            "outputFormat": "application/json",
            "srsName": "EPSG:4326",
            "maxFeatures": 100000,
        },
        "mapping": {
            "id_field": "VAKID",
            "type_field": "VAKFUNCTIE",
            "street_field": "STRAATNAAM",
            "area_field": "GEBIED",
        },
    },
    "arnhem": {
        "name": "Arnhem",
        "province": "Gelderland",
        "type": "arcgis",
        "url": "https://geo.arnhem.nl/arcgis/rest/services/OpenData/Parkeervakken/MapServer/0/query",
        "params": {
            "where": "1=1",
            "outFields": "*",
            "f": "geojson",
            "outSR": "4326",
        },
        "mapping": {
            "id_field": "OBJECTID",
            "type_field": "TYPE",
            "street_field": "STRAAT",
        },
    },
}


def fetch_wfs_data(config: dict) -> List[dict]:
    """Fetch parking data from WFS endpoint."""
    print(f"Fetching {config['name']} parking data (WFS)...")

    try:
        response = requests.get(config["url"], params=config["params"], timeout=120)
        response.raise_for_status()
        data = response.json()

        features = data.get("features", [])
        print(f"  Found {len(features)} parking spots")
        return features

    except requests.exceptions.RequestException as e:
        print(f"  Error fetching {config['name']}: {e}")
        return []


def fetch_arcgis_data(config: dict) -> List[dict]:
    """Fetch parking data from ArcGIS REST API with pagination."""
    print(f"Fetching {config['name']} parking data (ArcGIS)...")

    all_features = []
    offset = 0
    batch_size = 2000

    try:
        while True:
            params = {
                **config["params"],
                "resultOffset": offset,
                "resultRecordCount": batch_size,
            }

            response = requests.get(config["url"], params=params, timeout=120)
            response.raise_for_status()
            data = response.json()

            features = data.get("features", [])
            if not features:
                break

            all_features.extend(features)
            print(f"  Fetched {len(all_features)} spots so far...")

            # Check if there are more results
            if len(features) < batch_size:
                break

            offset += batch_size

        print(f"  Total: {len(all_features)} parking spots")
        return all_features

    except requests.exceptions.RequestException as e:
        print(f"  Error fetching {config['name']}: {e}")
        return all_features  # Return what we have


def process_features(features: List[dict], config: dict, city_key: str) -> List[dict]:
    """Process raw features into standardized parking facility format."""
    facilities = []
    mapping = config.get("mapping", {})

    for feature in features:
        props = feature.get("properties", {})
        geom = feature.get("geometry", {})

        # Get coordinates (handle both Point and Polygon)
        if geom.get("type") == "Point":
            coords = geom.get("coordinates", [])
            if len(coords) >= 2:
                lon, lat = coords[0], coords[1]
            else:
                continue
        elif geom.get("type") == "Polygon":
            # Use centroid of first ring
            rings = geom.get("coordinates", [[]])
            if rings and rings[0]:
                ring = rings[0]
                lon = sum(c[0] for c in ring) / len(ring)
                lat = sum(c[1] for c in ring) / len(ring)
            else:
                continue
        elif geom.get("type") == "MultiPolygon":
            # Use centroid of first polygon
            polys = geom.get("coordinates", [[[]]])
            if polys and polys[0] and polys[0][0]:
                ring = polys[0][0]
                lon = sum(c[0] for c in ring) / len(ring)
                lat = sum(c[1] for c in ring) / len(ring)
            else:
                continue
        else:
            continue

        # Determine parking type from source data
        type_value = str(props.get(mapping.get("type_field", ""), "")).lower()

        if "betaald" in type_value or "fiscaal" in type_value:
            parking_type = "street_paid"
        elif "vergunning" in type_value or "permit" in type_value:
            parking_type = "permit"
        elif "invalide" in type_value or "gehandicapt" in type_value or "miva" in type_value:
            parking_type = "disabled"
        elif "laden" in type_value or "lossen" in type_value:
            parking_type = "loading_zone"
        elif "elektrisch" in type_value or "ev" in type_value or "oplaad" in type_value:
            parking_type = "ev_charging"
        elif "taxi" in type_value:
            parking_type = "taxi"
        elif "motor" in type_value:
            parking_type = "motorcycle"
        else:
            parking_type = "parking_space"  # Generic parking space

        # Build ID
        id_value = props.get(mapping.get("id_field", ""), "")
        facility_id = f"{city_key}_{id_value}" if id_value else f"{city_key}_{len(facilities)}"

        # Build name
        street = props.get(mapping.get("street_field", ""), "")
        area = props.get(mapping.get("area_field", ""), "")
        name = f"{street}" if street else f"Parkeervak {config['name']}"

        facility = {
            "id": facility_id,
            "source": city_key,
            "source_detail": f"{config['name']} Open Data",
            "name": name,
            "type": parking_type,
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "latitude": lat,
            "longitude": lon,
            "municipality": config["name"],
            "province": config["province"],
            "address": street,
            "neighborhood": area if area else None,
            "raw_type": type_value,
            "last_updated": datetime.now(timezone.utc).isoformat(),
        }

        # Add original properties for reference
        facility["original_props"] = {k: v for k, v in props.items() if v is not None}

        facilities.append(facility)

    return facilities


def main():
    output_dir = Path(__file__).parent.parent / "data"
    output_dir.mkdir(exist_ok=True)

    all_facilities = []
    city_stats = {}

    for city_key, config in CITY_SOURCES.items():
        print(f"\n{'='*50}")
        print(f"Processing {config['name']}")
        print('='*50)

        # Fetch data based on source type
        if config["type"] == "wfs":
            features = fetch_wfs_data(config)
        elif config["type"] == "arcgis":
            features = fetch_arcgis_data(config)
        else:
            print(f"  Unknown source type: {config['type']}")
            continue

        if not features:
            print(f"  No data retrieved for {config['name']}")
            continue

        # Process features
        facilities = process_features(features, config, city_key)
        all_facilities.extend(facilities)

        # Generate stats for this city
        type_counts = {}
        for f in facilities:
            ptype = f["type"]
            type_counts[ptype] = type_counts.get(ptype, 0) + 1

        city_stats[city_key] = {
            "total": len(facilities),
            "by_type": type_counts,
        }

        print(f"\n{config['name']} Summary:")
        print(f"  Total spots: {len(facilities)}")
        print(f"  By type:")
        for ptype, count in sorted(type_counts.items(), key=lambda x: -x[1]):
            print(f"    {ptype}: {count}")

    # Generate overall statistics
    stats = {
        "total": len(all_facilities),
        "by_source": {},
        "by_type": {},
    }

    for f in all_facilities:
        src = f["source"]
        stats["by_source"][src] = stats["by_source"].get(src, 0) + 1

        ptype = f["type"]
        stats["by_type"][ptype] = stats["by_type"].get(ptype, 0) + 1

    print(f"\n{'='*50}")
    print("OVERALL SUMMARY")
    print('='*50)
    print(f"Total parking spots: {stats['total']}")
    print(f"By source:")
    for src, count in sorted(stats["by_source"].items(), key=lambda x: -x[1]):
        print(f"  {src}: {count}")
    print(f"By type:")
    for ptype, count in sorted(stats["by_type"].items(), key=lambda x: -x[1]):
        print(f"  {ptype}: {count}")

    # Save combined data
    output_file = output_dir / "dutch_cities_parking.json"
    output = {
        "metadata": {
            "sources": list(CITY_SOURCES.keys()),
            "city_stats": city_stats,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "stats": stats,
        },
        "features": all_facilities,
    }

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False)

    print(f"\nData saved to {output_file}")

    # Create GeoJSON
    geojson_output = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": f["id"],
                "geometry": f["geometry"],
                "properties": {k: v for k, v in f.items() if k not in ["geometry", "original_props"]},
            }
            for f in all_facilities
            if f.get("geometry")
        ],
    }

    geojson_file = output_dir / "dutch_cities_parking.geojson"
    with open(geojson_file, "w", encoding="utf-8") as f:
        json.dump(geojson_output, f, ensure_ascii=False)

    print(f"GeoJSON saved to {geojson_file}")

    return stats


if __name__ == "__main__":
    main()

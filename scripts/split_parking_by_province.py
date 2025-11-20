#!/usr/bin/env python3
"""
Split Netherlands parking spaces by province for efficient viewport-based loading.
Uses approximate province bounding boxes.
"""

import json
import gzip
from typing import Dict, List

# Approximate bounding boxes for Dutch provinces
PROVINCES = {
    'groningen': {
        'name': 'Groningen',
        'bounds': {'min_lat': 53.15, 'max_lat': 53.55, 'min_lon': 6.20, 'max_lon': 7.25}
    },
    'friesland': {
        'name': 'Friesland',
        'bounds': {'min_lat': 52.85, 'max_lat': 53.40, 'min_lon': 5.35, 'max_lon': 6.30}
    },
    'drenthe': {
        'name': 'Drenthe',
        'bounds': {'min_lat': 52.65, 'max_lat': 53.15, 'min_lon': 6.30, 'max_lon': 7.05}
    },
    'overijssel': {
        'name': 'Overijssel',
        'bounds': {'min_lat': 52.20, 'max_lat': 52.75, 'min_lon': 6.00, 'max_lon': 7.00}
    },
    'flevoland': {
        'name': 'Flevoland',
        'bounds': {'min_lat': 52.35, 'max_lat': 52.75, 'min_lon': 5.25, 'max_lon': 5.80}
    },
    'gelderland': {
        'name': 'Gelderland',
        'bounds': {'min_lat': 51.75, 'max_lat': 52.25, 'min_lon': 5.35, 'max_lon': 6.70}
    },
    'utrecht': {
        'name': 'Utrecht',
        'bounds': {'min_lat': 51.95, 'max_lat': 52.25, 'min_lon': 4.90, 'max_lon': 5.45}
    },
    'noord-holland': {
        'name': 'Noord-Holland',
        'bounds': {'min_lat': 52.25, 'max_lat': 53.00, 'min_lon': 4.60, 'max_lon': 5.25}
    },
    'zuid-holland': {
        'name': 'Zuid-Holland',
        'bounds': {'min_lat': 51.75, 'max_lat': 52.25, 'min_lon': 3.90, 'max_lon': 4.90}
    },
    'zeeland': {
        'name': 'Zeeland',
        'bounds': {'min_lat': 51.28, 'max_lat': 51.70, 'min_lon': 3.40, 'max_lon': 4.25}
    },
    'noord-brabant': {
        'name': 'Noord-Brabant',
        'bounds': {'min_lat': 51.35, 'max_lat': 51.85, 'min_lon': 4.50, 'max_lon': 5.90}
    },
    'limburg': {
        'name': 'Limburg',
        'bounds': {'min_lat': 50.75, 'max_lat': 51.50, 'min_lon': 5.70, 'max_lon': 6.25}
    }
}

def point_in_bounds(lon: float, lat: float, bounds: Dict) -> bool:
    """Check if a point is within bounding box."""
    return (bounds['min_lat'] <= lat <= bounds['max_lat'] and
            bounds['min_lon'] <= lon <= bounds['max_lon'])

def get_feature_centroid(feature: Dict) -> tuple:
    """Get centroid of a feature (for province assignment)."""
    geometry = feature['geometry']

    if geometry['type'] == 'Point':
        return tuple(geometry['coordinates'])

    elif geometry['type'] == 'Polygon':
        coords = geometry['coordinates'][0]
        # Simple centroid calculation
        lon_sum = sum(c[0] for c in coords)
        lat_sum = sum(c[1] for c in coords)
        count = len(coords)
        return (lon_sum / count, lat_sum / count)

    return (0, 0)

def split_by_province(input_file: str, output_dir: str = "truck-parking-map/public/provinces"):
    """Split parking spaces by province and create gzipped files."""

    print("=" * 80)
    print("SPLITTING NETHERLANDS PARKING SPACES BY PROVINCE")
    print("=" * 80)
    print()

    # Load data
    print(f"Loading {input_file}...")
    with open(input_file, 'r') as f:
        data = json.load(f)

    total_features = len(data['features'])
    print(f"Total parking spaces: {total_features}")
    print()

    # Initialize province collections
    province_data = {key: [] for key in PROVINCES.keys()}
    unassigned = []

    # Assign features to provinces
    print("Assigning parking spaces to provinces...")
    for i, feature in enumerate(data['features']):
        if (i + 1) % 50000 == 0:
            print(f"  Processed {i + 1:,} / {total_features:,} features...")

        lon, lat = get_feature_centroid(feature)
        assigned = False

        for province_key, province_info in PROVINCES.items():
            if point_in_bounds(lon, lat, province_info['bounds']):
                feature['properties']['province'] = province_info['name']
                province_data[province_key].append(feature)
                assigned = True
                break

        if not assigned:
            unassigned.append(feature)

    print(f"✓ Assignment complete")
    print()

    # Save province files (both regular and gzipped)
    import os
    os.makedirs(output_dir, exist_ok=True)

    print("PROVINCE BREAKDOWN:")
    print("-" * 80)

    province_stats = []

    for province_key, features in province_data.items():
        if not features:
            continue

        province_name = PROVINCES[province_key]['name']
        truck_count = len([f for f in features if f['properties']['vehicle_type'] == 'truck'])
        car_count = len([f for f in features if f['properties']['vehicle_type'] == 'car'])

        # Create GeoJSON
        geojson = {
            'type': 'FeatureCollection',
            'features': features
        }

        # Save regular JSON
        output_file = f"{output_dir}/{province_key}_parking_spaces.geojson"
        with open(output_file, 'w') as f:
            json.dump(geojson, f, separators=(',', ':'))  # Compact JSON

        # Save gzipped version
        output_file_gz = f"{output_dir}/{province_key}_parking_spaces.geojson.gz"
        with gzip.open(output_file_gz, 'wt', encoding='utf-8') as f:
            json.dump(geojson, f, separators=(',', ':'))

        # Get file sizes
        regular_size = os.path.getsize(output_file) / 1024 / 1024  # MB
        gz_size = os.path.getsize(output_file_gz) / 1024 / 1024  # MB
        compression_ratio = (1 - gz_size / regular_size) * 100 if regular_size > 0 else 0

        province_stats.append({
            'name': province_name,
            'key': province_key,
            'total': len(features),
            'truck': truck_count,
            'car': car_count,
            'size_mb': regular_size,
            'gz_size_mb': gz_size,
            'compression': compression_ratio
        })

        print(f"{province_name:20} {len(features):6,} spaces  ({truck_count:4} truck, {car_count:6,} car)")
        print(f"{'':20} Size: {regular_size:5.1f}MB → {gz_size:5.1f}MB (gz, {compression_ratio:.0f}% reduction)")

    print()
    print(f"Unassigned: {len(unassigned)} spaces (outside province bounds)")
    print()

    # Save province metadata
    metadata = {
        'provinces': PROVINCES,
        'stats': province_stats,
        'total_features': total_features,
        'unassigned': len(unassigned)
    }

    metadata_file = f"{output_dir}/province_metadata.json"
    with open(metadata_file, 'w') as f:
        json.dump(metadata, f, indent=2)

    print(f"✓ Saved province metadata to: {metadata_file}")
    print()

    # Create province index for component
    province_index = {
        key: {
            'name': info['name'],
            'bounds': info['bounds'],
            'file': f"/provinces/{key}_parking_spaces.geojson.gz",
            'stats': next((s for s in province_stats if s['key'] == key), None)
        }
        for key, info in PROVINCES.items()
    }

    index_file = f"{output_dir}/province_index.json"
    with open(index_file, 'w') as f:
        json.dump(province_index, f, indent=2)

    print(f"✓ Saved province index to: {index_file}")
    print()

    # Summary
    total_assigned = sum(len(features) for features in province_data.values())
    total_size = sum(s['size_mb'] for s in province_stats)
    total_gz_size = sum(s['gz_size_mb'] for s in province_stats)

    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Total parking spaces: {total_features:,}")
    print(f"Assigned to provinces: {total_assigned:,} ({total_assigned/total_features*100:.1f}%)")
    print(f"Unassigned: {len(unassigned):,} ({len(unassigned)/total_features*100:.1f}%)")
    print(f"Total size: {total_size:.1f}MB → {total_gz_size:.1f}MB (gzipped, {(1-total_gz_size/total_size)*100:.0f}% reduction)")
    print("=" * 80)

if __name__ == "__main__":
    import sys

    input_file = sys.argv[1] if len(sys.argv) > 1 else "netherlands_osm_individual_parking_spaces_reclassified.geojson"

    split_by_province(input_file)

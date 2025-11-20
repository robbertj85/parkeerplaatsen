#!/usr/bin/env python3
"""
Reclassify OSM parking spaces based on their actual dimensions.

Classification criteria based on CROW ASVV 2021 standards:
Source: https://kennisbank.crow.nl/public/gastgebruiker/WOBI/ASVV_2021/Maatvoering_van_parkeervoorzieningen/113583

Truck/HGV parking spaces:
- Minimum width: 3.5m
- Minimum length: 13m

Car spaces are typically 2.5m × 5m (12-15m²)
"""

import json
import math

METERS_PER_DEGREE_LAT = 111320
METERS_PER_DEGREE_LON = 70000

# Classification thresholds based on CROW ASVV 2021
TRUCK_MIN_WIDTH = 3.5   # meters
TRUCK_MIN_LENGTH = 13.0  # meters

def calculate_distance(p1, p2):
    """Calculate distance between two lon/lat points in meters."""
    lat_diff = (p2[1] - p1[1]) * METERS_PER_DEGREE_LAT
    lon_diff = (p2[0] - p1[0]) * METERS_PER_DEGREE_LON * math.cos(math.radians((p1[1] + p2[1])/2))
    return math.sqrt(lat_diff**2 + lon_diff**2)

def calculate_polygon_dimensions(coords):
    """Calculate width and length of a polygon from its coordinates."""
    if len(coords) < 4:
        return None, None, None

    # Calculate edge lengths
    edge1 = calculate_distance(coords[0], coords[1])
    edge2 = calculate_distance(coords[1], coords[2])

    # Width is shorter edge, length is longer edge
    width = min(edge1, edge2)
    length = max(edge1, edge2)
    area = width * length

    return width, length, area

def reclassify_parking_spaces(input_file, output_file):
    """Reclassify parking spaces based on size."""

    print("=" * 80)
    print("RECLASSIFYING OSM PARKING SPACES BY SIZE")
    print("=" * 80)
    print()

    with open(input_file, 'r') as f:
        data = json.load(f)

    print(f"Loaded {len(data['features'])} parking spaces")
    print()
    print(f"Classification criteria (CROW ASVV 2021):")
    print(f"  Truck: width >= {TRUCK_MIN_WIDTH}m AND length >= {TRUCK_MIN_LENGTH}m")
    print()

    truck_count = 0
    car_count = 0
    point_count = 0

    for feature in data['features']:
        if feature['geometry']['type'] == 'Polygon':
            coords = feature['geometry']['coordinates'][0]
            width, length, area = calculate_polygon_dimensions(coords)

            if width and length and area:
                # Store dimensions in properties
                feature['properties']['width_m'] = round(width, 2)
                feature['properties']['length_m'] = round(length, 2)
                feature['properties']['area_m2'] = round(area, 1)

                # Reclassify based on CROW ASVV 2021 criteria
                # Truck space requires BOTH width >= 3.5m AND length >= 13m
                if width >= TRUCK_MIN_WIDTH and length >= TRUCK_MIN_LENGTH:
                    feature['properties']['vehicle_type'] = 'truck'
                    feature['properties']['classification_method'] = 'size-based (CROW ASVV 2021)'
                    truck_count += 1
                else:
                    feature['properties']['vehicle_type'] = 'car'
                    feature['properties']['classification_method'] = 'size-based (CROW ASVV 2021)'
                    car_count += 1

        elif feature['geometry']['type'] == 'Point':
            # For point geometries, we can't calculate size
            # Keep original classification or default to car
            feature['properties']['classification_method'] = 'tag-based'
            point_count += 1
            if feature['properties']['vehicle_type'] == 'truck':
                truck_count += 1
            else:
                car_count += 1

    print("RECLASSIFICATION RESULTS")
    print("-" * 80)
    print(f"Truck parking spaces: {truck_count}")
    print(f"Car parking spaces: {car_count}")
    print(f"Point geometries: {point_count}")
    print(f"Polygon geometries: {len(data['features']) - point_count}")
    print()

    # Save reclassified data
    with open(output_file, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"✓ Saved reclassified data to: {output_file}")

    # Also copy to public directory (use output filename)
    import os
    public_filename = os.path.basename(output_file)
    public_file = f"truck-parking-map/public/{public_filename}"
    with open(public_file, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"✓ Copied to: {public_file}")

    return truck_count, car_count

if __name__ == "__main__":
    import sys

    # Support command-line argument for input file
    if len(sys.argv) > 1:
        input_file = sys.argv[1]
        output_file = input_file.replace('.geojson', '_reclassified.geojson')
    else:
        input_file = "rotterdam_osm_individual_parking_spaces.geojson"
        output_file = "rotterdam_osm_individual_parking_spaces_reclassified.geojson"

    print(f"Input: {input_file}")
    print(f"Output: {output_file}")
    print()

    truck_count, car_count = reclassify_parking_spaces(input_file, output_file)

    print()
    print("=" * 80)
    print(f"DONE! Found {truck_count} truck spaces and {car_count} car spaces")
    print("=" * 80)

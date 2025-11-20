#!/usr/bin/env python3
"""
Extract individual parking SPACE nodes from OpenStreetMap for entire Netherlands.
These are amenity=parking_space tags, not parking area boundaries.
Uses regional queries with 5-second delays to respect Overpass API rate limits.
"""

import json
import requests
import time
from typing import Dict, List

# Netherlands bounding box with generous buffer
NETHERLANDS_BOUNDS = {
    'min_lat': 50.70,  # Southern tip (with buffer)
    'max_lat': 53.60,  # Northern islands (with buffer)
    'min_lon': 3.25,   # Western coast (with buffer)
    'max_lon': 7.25    # Eastern border (with buffer)
}

def create_regional_grid(bounds: Dict, rows: int = 3, cols: int = 2) -> List[Dict]:
    """Divide Netherlands into smaller regions to avoid Overpass timeouts."""
    regions = []

    lat_step = (bounds['max_lat'] - bounds['min_lat']) / rows
    lon_step = (bounds['max_lon'] - bounds['min_lon']) / cols

    for row in range(rows):
        for col in range(cols):
            region = {
                'name': f"Region_{row+1}_{col+1}",
                'min_lat': bounds['min_lat'] + row * lat_step,
                'max_lat': bounds['min_lat'] + (row + 1) * lat_step,
                'min_lon': bounds['min_lon'] + col * lon_step,
                'max_lon': bounds['min_lon'] + (col + 1) * lon_step
            }
            regions.append(region)

    return regions

def query_osm_parking_spaces_region(region: Dict, delay: int = 5) -> Dict:
    """Query OSM Overpass API for individual parking space nodes in a region."""
    overpass_url = "https://overpass-api.de/api/interpreter"

    bbox_str = f"{region['min_lat']},{region['min_lon']},{region['max_lat']},{region['max_lon']}"

    # Query for individual parking spaces
    overpass_query = f"""
    [out:json][timeout:240];
    (
      // Individual parking space nodes
      node["amenity"="parking_space"]({bbox_str});

      // Also get parking spaces as ways (some are mapped as small polygons)
      way["amenity"="parking_space"]({bbox_str});
    );
    out body;
    >;
    out skel qt;
    """

    print(f"Querying {region['name']}...")
    print(f"  Bounding box: {bbox_str}")

    try:
        response = requests.post(
            overpass_url,
            data={"data": overpass_query},
            timeout=300
        )
        response.raise_for_status()
        data = response.json()

        elements = data.get('elements', [])
        print(f"  ✓ Found {len(elements)} OSM elements")

        # Delay before next request
        if delay > 0:
            print(f"  ⏳ Waiting {delay} seconds before next request...")
            time.sleep(delay)

        return data
    except Exception as e:
        print(f"  ✗ Error querying OSM: {e}")
        return {'elements': []}

def extract_parking_spaces(osm_data: Dict) -> List[Dict]:
    """Extract parking space features from OSM response."""
    elements = osm_data.get('elements', [])

    # Build node lookup for ways
    nodes = {e['id']: e for e in elements if e['type'] == 'node'}

    parking_spaces = []

    for element in elements:
        tags = element.get('tags', {})

        # Skip if not a parking space
        if tags.get('amenity') != 'parking_space':
            continue

        geometry = None

        # Handle point parking spaces
        if element['type'] == 'node' and 'lat' in element and 'lon' in element:
            geometry = {
                'type': 'Point',
                'coordinates': [element['lon'], element['lat']]
            }

        # Handle polygon parking spaces
        elif element['type'] == 'way' and 'nodes' in element:
            coords = []
            for node_id in element['nodes']:
                if node_id in nodes:
                    node = nodes[node_id]
                    coords.append([node['lon'], node['lat']])

            if len(coords) >= 3:
                geometry = {
                    'type': 'Polygon',
                    'coordinates': [coords]
                }

        if geometry:
            # Determine vehicle type (will be reclassified by size later)
            capacity_type = tags.get('capacity:disabled', tags.get('capacity:hgv', ''))
            vehicle_type = 'truck' if 'hgv' in capacity_type.lower() else 'car'

            parking_space = {
                'type': 'Feature',
                'geometry': geometry,
                'properties': {
                    'feature_type': 'osm_parking_space',
                    'osm_id': element['id'],
                    'osm_type': element['type'],
                    'vehicle_type': vehicle_type,
                    'capacity_type': tags.get('capacity', 'N/A'),
                    'access': tags.get('access', 'N/A'),
                    'orientation': tags.get('orientation', 'N/A'),
                    'parking': tags.get('parking', 'N/A'),
                    'surface': tags.get('surface', 'N/A'),
                }
            }
            parking_spaces.append(parking_space)

    return parking_spaces

def deduplicate_parking_spaces(all_spaces: List[Dict]) -> List[Dict]:
    """Remove duplicate parking spaces based on OSM ID."""
    seen_ids = set()
    unique_spaces = []

    for space in all_spaces:
        osm_id = space['properties']['osm_id']
        if osm_id not in seen_ids:
            seen_ids.add(osm_id)
            unique_spaces.append(space)

    return unique_spaces

def main():
    print("=" * 80)
    print("OSM INDIVIDUAL PARKING SPACES EXTRACTION - NETHERLANDS")
    print("=" * 80)
    print()

    # Create regional grid
    regions = create_regional_grid(NETHERLANDS_BOUNDS, rows=3, cols=2)
    print(f"Divided Netherlands into {len(regions)} regions")
    print()

    # Query each region with 5-second delays
    all_parking_spaces = []

    for i, region in enumerate(regions, 1):
        print(f"[{i}/{len(regions)}] Processing {region['name']}")
        osm_data = query_osm_parking_spaces_region(region, delay=5)

        # Extract parking spaces from this region
        parking_spaces = extract_parking_spaces(osm_data)
        all_parking_spaces.extend(parking_spaces)

        print(f"  Region total: {len(parking_spaces)} parking spaces")
        print()

    # Deduplicate (regions may overlap at boundaries)
    print("Deduplicating parking spaces...")
    unique_spaces = deduplicate_parking_spaces(all_parking_spaces)

    print(f"✓ Total extracted: {len(unique_spaces)} unique parking spaces")
    print()

    # Count by type (before size-based reclassification)
    truck_spaces = [s for s in unique_spaces if s['properties']['vehicle_type'] == 'truck']
    car_spaces = [s for s in unique_spaces if s['properties']['vehicle_type'] == 'car']

    print(f"  Truck/HGV spaces (tag-based): {len(truck_spaces)}")
    print(f"  Car spaces (tag-based): {len(car_spaces)}")
    print()

    # Count by geometry type
    point_spaces = [s for s in unique_spaces if s['geometry']['type'] == 'Point']
    polygon_spaces = [s for s in unique_spaces if s['geometry']['type'] == 'Polygon']

    print(f"  Point geometries: {len(point_spaces)}")
    print(f"  Polygon geometries: {len(polygon_spaces)}")
    print()

    # Save output
    output = {
        'type': 'FeatureCollection',
        'features': unique_spaces
    }

    output_file = "netherlands_osm_individual_parking_spaces.geojson"
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"✓ Saved to: {output_file}")
    print()
    print("=" * 80)
    print("NEXT STEP: Run reclassify_osm_parking_by_size.py to classify by dimensions")
    print("=" * 80)

if __name__ == "__main__":
    main()

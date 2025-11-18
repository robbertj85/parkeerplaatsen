#!/usr/bin/env python3
"""
Extract individual parking spaces from OSM for all South Holland truck parking facilities.

This script:
1. Loads South Holland truck parking facilities
2. Queries OSM Overpass API for each facility
3. Extracts individual parking spaces (amenity=parking_space)
4. Classifies parking by vehicle type (car/van, truck, LZV)
5. Generates comprehensive GeoJSON overlay with all parking spaces
"""

import json
import requests
from typing import List, Dict
import time

def query_osm_parking_for_facility(lat: float, lon: float, facility_name: str, radius_m: int = 300) -> Dict:
    """
    Query OSM Overpass API for parking spaces around a facility.

    Args:
        lat: Facility latitude
        lon: Facility longitude
        facility_name: Name of the facility
        radius_m: Search radius in meters

    Returns:
        OSM data with parking spaces
    """
    overpass_url = "https://overpass-api.de/api/interpreter"

    overpass_query = f"""
    [out:json][timeout:60];
    (
      // Parking areas
      way["amenity"="parking"](around:{radius_m},{lat},{lon});
      relation["amenity"="parking"](around:{radius_m},{lat},{lon});

      // Individual parking spaces (THIS IS WHAT WE WANT!)
      way["amenity"="parking_space"](around:{radius_m},{lat},{lon});
      node["amenity"="parking_space"](around:{radius_m},{lat},{lon});

      // Parking aisles
      way["service"="parking_aisle"](around:{radius_m},{lat},{lon});

      // HGV parking specifically
      way["hgv"="designated"](around:{radius_m},{lat},{lon});
      way["hgv"="yes"](around:{radius_m},{lat},{lon});
    );
    out body;
    >;
    out skel qt;
    """

    try:
        response = requests.post(
            overpass_url,
            data={"data": overpass_query},
            timeout=90
        )
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"  ⚠ Error querying OSM for {facility_name}: {e}")
        return {'elements': []}

def classify_parking_from_osm(tags: Dict) -> Dict:
    """
    Classify parking type from OSM tags.

    Args:
        tags: OSM element tags

    Returns:
        Classification info
    """
    # Check for HGV/truck designation
    is_hgv = (
        tags.get('hgv') in ['designated', 'yes'] or
        tags.get('capacity:hgv') or
        tags.get('capacity:truck') or
        'truck' in tags.get('name', '').lower() or
        'hgv' in tags.get('name', '').lower() or
        'vrachtwagen' in tags.get('name', '').lower()
    )

    # Determine vehicle type
    if is_hgv:
        # Check if it could be LZV based on name or tags
        is_lzv = (
            'lzv' in tags.get('name', '').lower() or
            'lang zwaar' in tags.get('name', '').lower() or
            tags.get('maxlength', '0') == '25.25'
        )

        if is_lzv:
            vehicle_type = 'lzv'
            label = 'LZV Parking Space'
            color = '#7c2d12'  # dark brown
        else:
            vehicle_type = 'truck'
            label = 'Truck Parking Space'
            color = '#ef4444'  # red
    else:
        # Default to truck if in our truck parking dataset
        vehicle_type = 'truck'
        label = 'Truck Parking Space'
        color = '#ef4444'

    return {
        'vehicle_type': vehicle_type,
        'label': label,
        'color': color,
        'is_hgv': is_hgv
    }

def extract_parking_from_osm(osm_data: Dict, facility_id: str, facility_name: str) -> Dict:
    """
    Extract and classify parking data from OSM response.

    Args:
        osm_data: OSM API response
        facility_id: ID of the facility being analyzed
        facility_name: Name of the facility

    Returns:
        Structured parking data
    """
    elements = osm_data.get('elements', [])

    result = {
        'facility_id': facility_id,
        'facility_name': facility_name,
        'osm_parking_areas': [],
        'osm_parking_spaces': [],
        'total_capacity': 0,
        'individual_spaces_count': 0,
        'has_osm_data': False
    }

    # Build node lookup for geometry construction
    nodes = {e['id']: e for e in elements if e['type'] == 'node'}

    for element in elements:
        tags = element.get('tags', {})

        # Individual parking spaces (PRIORITY!)
        if tags.get('amenity') == 'parking_space':
            result['has_osm_data'] = True
            result['individual_spaces_count'] += 1

            classification = classify_parking_from_osm(tags)

            space = {
                'osm_id': element['id'],
                'osm_type': element['type'],
                'classification': classification,
                'tags': tags
            }

            # Extract geometry
            if element['type'] == 'way' and 'nodes' in element:
                coords = []
                for node_id in element['nodes']:
                    if node_id in nodes:
                        node = nodes[node_id]
                        coords.append([node['lon'], node['lat']])

                if len(coords) >= 3:
                    space['geometry'] = {
                        'type': 'Polygon',
                        'coordinates': [coords]
                    }
            elif element['type'] == 'node':
                # Point geometry for node-based spaces
                space['geometry'] = {
                    'type': 'Point',
                    'coordinates': [element['lon'], element['lat']]
                }

            result['osm_parking_spaces'].append(space)

        # Parking areas (for context and capacity)
        elif tags.get('amenity') == 'parking':
            result['has_osm_data'] = True
            classification = classify_parking_from_osm(tags)

            # Extract capacity
            capacity = tags.get('capacity', 0)
            try:
                capacity = int(capacity)
            except (ValueError, TypeError):
                capacity = 0

            result['total_capacity'] += capacity

            parking_area = {
                'osm_id': element['id'],
                'osm_type': element['type'],
                'name': tags.get('name', 'Unnamed Parking'),
                'operator': tags.get('operator', 'Unknown'),
                'capacity': capacity,
                'classification': classification,
                'tags': tags
            }

            # Extract geometry for ways
            if element['type'] == 'way' and 'nodes' in element:
                coords = []
                for node_id in element['nodes']:
                    if node_id in nodes:
                        node = nodes[node_id]
                        coords.append([node['lon'], node['lat']])

                if len(coords) >= 3:
                    parking_area['geometry'] = {
                        'type': 'Polygon',
                        'coordinates': [coords]
                    }

            result['osm_parking_areas'].append(parking_area)

    return result

def analyze_all_south_holland_facilities():
    """
    Analyze all truck parking facilities in South Holland using OSM data.
    """
    print("="*80)
    print("OSM PARKING SPACE EXTRACTION - SOUTH HOLLAND")
    print("="*80)
    print()

    # Load South Holland facilities
    print("Loading South Holland truck parking facilities...")
    with open('truck-parking-map/public/south_holland_truck_parking.geojson', 'r') as f:
        geojson_data = json.load(f)

    facilities = geojson_data['features']
    print(f"✓ Loaded {len(facilities)} facilities")
    print()

    results = []
    total_stats = {
        'facilities_with_osm_data': 0,
        'facilities_without_osm_data': 0,
        'total_parking_areas': 0,
        'total_individual_spaces': 0,
        'total_capacity': 0
    }

    print("Querying OSM for individual parking spaces...")
    print("-" * 80)

    for i, feature in enumerate(facilities, 1):
        props = feature['properties']
        facility_id = props['osm_id']
        facility_name = props['name']
        coords = feature['geometry']['coordinates']
        lon, lat = coords[0], coords[1]

        print(f"\n[{i}/{len(facilities)}] {facility_name}")
        print(f"  Location: {lat:.5f}, {lon:.5f}")
        print(f"  Querying OSM...", end=" ", flush=True)

        # Query OSM
        osm_data = query_osm_parking_for_facility(lat, lon, facility_name, radius_m=300)
        parking_data = extract_parking_from_osm(osm_data, str(facility_id), facility_name)

        # Add facility info
        parking_data['facility_lat'] = lat
        parking_data['facility_lon'] = lon

        # Update stats
        if parking_data['has_osm_data']:
            total_stats['facilities_with_osm_data'] += 1
            total_stats['total_parking_areas'] += len(parking_data['osm_parking_areas'])
            total_stats['total_individual_spaces'] += parking_data['individual_spaces_count']
            total_stats['total_capacity'] += parking_data['total_capacity']

            print(f"✓ Found!")
            if parking_data['individual_spaces_count'] > 0:
                print(f"    Individual spaces: {parking_data['individual_spaces_count']}")
            if len(parking_data['osm_parking_areas']) > 0:
                print(f"    Parking areas: {len(parking_data['osm_parking_areas'])}")
            if parking_data['total_capacity'] > 0:
                print(f"    Total capacity: {parking_data['total_capacity']}")
        else:
            total_stats['facilities_without_osm_data'] += 1
            print("✗ No OSM data")

        results.append(parking_data)

        # Rate limiting (Overpass API allows ~2 requests/second)
        time.sleep(0.6)

    # Print summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    print(f"Total facilities analyzed: {len(facilities)}")
    print(f"Facilities with OSM data: {total_stats['facilities_with_osm_data']}")
    print(f"Facilities without OSM data: {total_stats['facilities_without_osm_data']}")
    print(f"Coverage: {total_stats['facilities_with_osm_data']/len(facilities)*100:.1f}%")
    print()
    print(f"Total parking areas mapped: {total_stats['total_parking_areas']}")
    print(f"Total individual spaces mapped: {total_stats['total_individual_spaces']}")
    print(f"Total capacity (from OSM tags): {total_stats['total_capacity']}")

    # Save results
    output = {
        'summary': total_stats,
        'facilities': results
    }

    output_file = 'south_holland_osm_parking_analysis.json'
    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\n✓ Detailed results saved to: {output_file}")

    # Create GeoJSON overlay
    create_geojson_overlay(results)

    return output

def create_geojson_overlay(facility_results: List[Dict]):
    """
    Create comprehensive GeoJSON overlay with all parking spaces.

    Args:
        facility_results: List of facility parking data
    """
    features = []

    for facility in facility_results:
        if not facility['has_osm_data']:
            continue

        # Add individual parking spaces (PRIORITY!)
        for space in facility['osm_parking_spaces']:
            if 'geometry' not in space:
                continue

            classification = space['classification']

            feature = {
                'type': 'Feature',
                'geometry': space['geometry'],
                'properties': {
                    'feature_type': 'parking_space',
                    'facility_id': facility['facility_id'],
                    'facility_name': facility['facility_name'],
                    'osm_id': space['osm_id'],
                    'osm_type': space['osm_type'],
                    'vehicle_type': classification['vehicle_type'],
                    'vehicle_label': classification['label'],
                    'color': classification['color'],
                    'is_hgv': classification['is_hgv']
                }
            }
            features.append(feature)

        # Add parking areas (for context)
        for area in facility['osm_parking_areas']:
            if 'geometry' not in area:
                continue

            classification = area['classification']

            feature = {
                'type': 'Feature',
                'geometry': area['geometry'],
                'properties': {
                    'feature_type': 'parking_area',
                    'facility_id': facility['facility_id'],
                    'facility_name': facility['facility_name'],
                    'osm_id': area['osm_id'],
                    'osm_type': area['osm_type'],
                    'name': area['name'],
                    'operator': area['operator'],
                    'capacity': area['capacity'],
                    'vehicle_type': classification['vehicle_type'],
                    'vehicle_label': classification['label'],
                    'color': classification['color'],
                    'is_hgv': classification['is_hgv']
                }
            }
            features.append(feature)

    geojson = {
        'type': 'FeatureCollection',
        'features': features
    }

    # Save to file
    output_file = 'south_holland_osm_parking_spaces.geojson'
    with open(output_file, 'w') as f:
        json.dump(geojson, f, indent=2)

    print(f"\n✓ GeoJSON overlay created: {output_file}")
    print(f"  Total features: {len(features)}")

    # Copy to public directory
    public_file = 'truck-parking-map/public/south_holland_osm_parking_spaces.geojson'
    with open(public_file, 'w') as f:
        json.dump(geojson, f, indent=2)
    print(f"  Copied to: {public_file}")

def main():
    """Main entry point."""
    analyze_all_south_holland_facilities()

if __name__ == "__main__":
    main()

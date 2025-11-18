#!/usr/bin/env python3
"""
Estimate and fit parking spaces into parking areas where individual spaces
are not mapped in OSM.

This script:
1. Identifies parking areas without individual space mapping
2. Calculates the polygon area
3. Estimates number of spaces based on capacity tags or area
4. Fits parking spaces in a grid pattern within the polygon bounds
5. Generates GeoJSON overlay with estimated spaces
"""

import json
import math
from typing import List, Dict, Tuple
from shapely.geometry import Polygon, Point, box
from shapely.ops import unary_union
import numpy as np

# Standard parking space dimensions
TRUCK_SPACE_WIDTH = 4.0  # meters
TRUCK_SPACE_LENGTH = 15.0  # meters
VAN_SPACE_WIDTH = 2.5  # meters
VAN_SPACE_LENGTH = 5.0  # meters

# Approximate meters per degree at Netherlands latitude (52°N)
METERS_PER_DEGREE_LAT = 111320
METERS_PER_DEGREE_LON = 70000  # Adjusted for latitude

def meters_to_degrees(meters: float, latitude: float) -> Tuple[float, float]:
    """Convert meters to degrees at given latitude."""
    lat_deg = meters / METERS_PER_DEGREE_LAT
    lon_deg = meters / (METERS_PER_DEGREE_LON * math.cos(math.radians(latitude)))
    return lat_deg, lon_deg

def calculate_polygon_area_m2(coords: List[List[float]], centroid_lat: float) -> float:
    """Calculate approximate area of polygon in square meters."""
    try:
        # Convert to shapely polygon
        polygon = Polygon(coords)

        # Get area in square degrees
        area_deg2 = polygon.area

        # Convert to square meters (approximate)
        lat_m_per_deg = METERS_PER_DEGREE_LAT
        lon_m_per_deg = METERS_PER_DEGREE_LON * math.cos(math.radians(centroid_lat))
        area_m2 = area_deg2 * lat_m_per_deg * lon_m_per_deg

        return area_m2
    except:
        return 0

def estimate_spaces_in_polygon(polygon_coords: List[List[float]],
                               capacity: int,
                               vehicle_type: str,
                               centroid_lat: float,
                               centroid_lon: float) -> List[Dict]:
    """
    Estimate and fit parking spaces into a polygon.

    Args:
        polygon_coords: Polygon coordinates [[lon, lat], ...]
        capacity: Number of spaces (from OSM tags or estimated)
        vehicle_type: 'truck' or 'car'
        centroid_lat: Latitude for conversion calculations
        centroid_lon: Longitude for conversion calculations

    Returns:
        List of estimated parking space features
    """
    # Choose dimensions based on vehicle type
    if vehicle_type == 'truck':
        space_width_m = TRUCK_SPACE_WIDTH
        space_length_m = TRUCK_SPACE_LENGTH
    else:
        space_width_m = VAN_SPACE_WIDTH
        space_length_m = VAN_SPACE_LENGTH

    # Create shapely polygon
    try:
        polygon = Polygon(polygon_coords)
        bounds = polygon.bounds  # (minx, miny, maxx, maxy)

        # Convert space dimensions to degrees
        lat_deg_per_m, lon_deg_per_m = meters_to_degrees(1.0, centroid_lat)
        space_width_deg = space_width_m * lon_deg_per_m
        space_length_deg = space_length_m * lat_deg_per_m

        # Add some spacing between spaces (20%)
        spacing_factor = 1.2
        space_width_deg *= spacing_factor
        space_length_deg *= spacing_factor

        # Calculate grid dimensions
        width_deg = bounds[2] - bounds[0]
        height_deg = bounds[3] - bounds[1]

        cols = max(1, int(width_deg / space_width_deg))
        rows = max(1, int(height_deg / space_length_deg))

        # If capacity is specified, adjust grid to match
        if capacity > 0:
            total_grid_spaces = rows * cols
            if total_grid_spaces > 0:
                scale_factor = math.sqrt(capacity / total_grid_spaces)
                rows = max(1, int(rows * scale_factor))
                cols = max(1, int(cols * scale_factor))

        # Generate grid of spaces
        spaces = []
        space_num = 1

        for row in range(rows):
            for col in range(cols):
                # Calculate center of this space
                center_lon = bounds[0] + (col + 0.5) * (width_deg / cols)
                center_lat = bounds[1] + (row + 0.5) * (height_deg / rows)

                # Check if center is inside polygon
                point = Point(center_lon, center_lat)
                if not polygon.contains(point):
                    continue

                # Create parking space polygon
                half_width = (space_width_m / 2) * lon_deg_per_m
                half_length = (space_length_m / 2) * lat_deg_per_m

                space_coords = [
                    [center_lon - half_width, center_lat - half_length],
                    [center_lon + half_width, center_lat - half_length],
                    [center_lon + half_width, center_lat + half_length],
                    [center_lon - half_width, center_lat + half_length],
                    [center_lon - half_width, center_lat - half_length],
                ]

                spaces.append({
                    'space_number': space_num,
                    'center_lat': center_lat,
                    'center_lon': center_lon,
                    'width_m': space_width_m,
                    'length_m': space_length_m,
                    'area_m2': space_width_m * space_length_m,
                    'polygon_coords': space_coords,
                    'estimated': True
                })

                space_num += 1

                # Stop if we've reached capacity
                if capacity > 0 and space_num > capacity:
                    break

            if capacity > 0 and space_num > capacity:
                break

        return spaces

    except Exception as e:
        print(f"  Error estimating spaces: {e}")
        return []

def estimate_spaces_for_facilities():
    """Estimate parking spaces for all facilities without individual space mapping."""
    print("="*80)
    print("PARKING SPACE ESTIMATION FOR UNMAPPED AREAS")
    print("="*80)
    print()

    # Load OSM parking analysis
    with open('south_holland_osm_parking_analysis.json', 'r') as f:
        analysis = json.load(f)

    # Load OSM parking spaces (to check which areas already have spaces)
    with open('truck-parking-map/public/south_holland_osm_parking_spaces.geojson', 'r') as f:
        osm_spaces = json.load(f)

    print(f"Loaded {len(analysis['facilities'])} facilities")
    print()

    # Find facilities with parking areas but no individual spaces
    candidates = []
    for facility in analysis['facilities']:
        if len(facility['osm_parking_areas']) > 0 and facility['individual_spaces_count'] == 0:
            candidates.append(facility)

    print(f"Found {len(candidates)} facilities with parking areas but no individual spaces")
    print()

    # Estimate spaces for each candidate
    estimated_features = []
    total_estimated_spaces = 0

    for i, facility in enumerate(candidates, 1):
        print(f"[{i}/{len(candidates)}] {facility['facility_name']}")
        print(f"  Facility ID: {facility['facility_id']}")
        print(f"  Parking areas: {len(facility['osm_parking_areas'])}")
        print(f"  Capacity from tags: {facility['total_capacity']}")

        facility_spaces = 0

        for area in facility['osm_parking_areas']:
            if 'geometry' not in area:
                continue

            # Get polygon coords
            coords = area['geometry']['coordinates'][0]

            # Determine vehicle type
            vehicle_type = area['classification']['vehicle_type']

            # Get capacity (use area capacity or estimate from area size)
            capacity = area.get('capacity', 0)
            if capacity == 0 and facility['total_capacity'] > 0:
                # Distribute total capacity among areas
                capacity = facility['total_capacity'] // len(facility['osm_parking_areas'])

            # Calculate area
            centroid_lat = facility['facility_lat']
            centroid_lon = facility['facility_lon']
            area_m2 = calculate_polygon_area_m2(coords, centroid_lat)

            # Estimate capacity from area if still zero
            if capacity == 0 and area_m2 > 0:
                space_area = TRUCK_SPACE_WIDTH * TRUCK_SPACE_LENGTH if vehicle_type == 'truck' else VAN_SPACE_WIDTH * VAN_SPACE_LENGTH
                # Use 60% efficiency factor (not all space is usable)
                capacity = int((area_m2 * 0.6) / space_area)

            # Estimate spaces
            spaces = estimate_spaces_in_polygon(
                coords,
                capacity,
                vehicle_type,
                centroid_lat,
                centroid_lon
            )

            # Create GeoJSON features
            for space in spaces:
                feature = {
                    'type': 'Feature',
                    'geometry': {
                        'type': 'Polygon',
                        'coordinates': [space['polygon_coords']]
                    },
                    'properties': {
                        'feature_type': 'estimated_parking_space',
                        'facility_id': facility['facility_id'],
                        'facility_name': facility['facility_name'],
                        'parking_area_osm_id': area['osm_id'],
                        'parking_area_name': area['name'],
                        'space_number': space['space_number'],
                        'vehicle_type': vehicle_type,
                        'vehicle_label': f"Estimated {area['classification']['label']}",
                        'color': '#9333ea',  # Purple for estimated spaces
                        'width_m': space['width_m'],
                        'length_m': space['length_m'],
                        'area_m2': space['area_m2'],
                        'estimated': True
                    }
                }
                estimated_features.append(feature)
                facility_spaces += 1

        total_estimated_spaces += facility_spaces
        print(f"  Estimated: {facility_spaces} parking spaces")
        print()

    # Create GeoJSON
    geojson = {
        'type': 'FeatureCollection',
        'features': estimated_features
    }

    # Save to file
    output_file = 'south_holland_estimated_parking_spaces.geojson'
    with open(output_file, 'w') as f:
        json.dump(geojson, f, indent=2)

    # Copy to public directory
    public_file = 'truck-parking-map/public/south_holland_estimated_parking_spaces.geojson'
    with open(public_file, 'w') as f:
        json.dump(geojson, f, indent=2)

    # Summary
    print("="*80)
    print("SUMMARY")
    print("="*80)
    print(f"Facilities processed: {len(candidates)}")
    print(f"Total estimated parking spaces: {total_estimated_spaces}")
    print(f"Average per facility: {total_estimated_spaces / len(candidates):.1f}")
    print()
    print(f"✓ Saved to: {output_file}")
    print(f"✓ Copied to: {public_file}")

def main():
    """Main entry point."""
    try:
        # Check if shapely is installed
        import shapely
    except ImportError:
        print("Error: shapely library is required")
        print("Install with: pip install shapely")
        return

    estimate_spaces_for_facilities()

if __name__ == "__main__":
    main()

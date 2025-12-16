#!/usr/bin/env python3
"""
Fetch parking data from Utrecht Open Data.

Data sources:
- P-route parkeren (real-time garage availability): data.utrecht.nl
- Parkeerautomaten: open.utrecht.nl
"""

import json
import requests
from datetime import datetime, timezone
from pathlib import Path


# Utrecht data endpoints
UTRECHT_PBROUTE_API = "https://stallingsnet.nl/api/1/parkingcount/utrecht"
UTRECHT_AUTOMATEN_API = "https://ckan.dataplatform.nl/api/3/action/datastore_search"
UTRECHT_AUTOMATEN_RESOURCE = "e3a34c9f-3b15-4b85-abed-8d0f19d7a0eb"

# Alternative: RDW data for Utrecht parking garages
RDW_GEBIEDB_API = "https://opendata.rdw.nl/resource/adw6-9hsg.json"

# Known Utrecht parking garage locations (Stallingsnet doesn't provide coordinates)
UTRECHT_GARAGE_LOCATIONS = {
    "Zadelstraat": (52.09238, 5.12175),
    "Vredenburg": (52.09268, 5.11494),
    "Stadhuis": (52.09149, 5.11774),
    "Laag Catharijne": (52.08996, 5.11095),
    "UB Plein": (52.08545, 5.11815),
    "Stationsplein": (52.08946, 5.10960),
    "Keizerstraat": (52.08999, 5.12168),
    "Knoop": (52.08763, 5.11115),
    "Jaarbeursplein": (52.08831, 5.10148),
    "Neude": (52.09340, 5.11877),
    "House Modernes": (52.09070, 5.11860),
    "Sijpesteijn": (52.09200, 5.10640),
    "Springweg": (52.09397, 5.11568),
}


def get_garage_coords(name: str) -> tuple:
    """Get coordinates for a Utrecht parking garage by name."""
    # Try exact match first
    if name in UTRECHT_GARAGE_LOCATIONS:
        return UTRECHT_GARAGE_LOCATIONS[name]

    # Try partial match (e.g., "Vredenburg Hoog" -> "Vredenburg")
    for garage_name, coords in UTRECHT_GARAGE_LOCATIONS.items():
        if name.startswith(garage_name):
            return coords

    return None


def fetch_pbroute_data() -> list:
    """Fetch real-time P-route parking data from Stallingsnet."""
    print("Fetching Utrecht P-route real-time data...")

    try:
        response = requests.get(UTRECHT_PBROUTE_API, timeout=30)
        response.raise_for_status()
        data = response.json()

        facilities = []
        seen_garages = set()  # Track main garages to avoid duplicates from "Hoog"/"Laag" variants

        for item in data:
            name = item.get("facilityName", "")

            # Skip "Hoog" and "Laag" variants - use the main garage entry
            if " Hoog" in name or " Laag" in name:
                continue

            # Skip "Pop Up" temporary entries
            if name.startswith("Pop Up"):
                continue

            # Get coordinates from our lookup
            coords = get_garage_coords(name)
            if not coords:
                print(f"  Warning: No coordinates for '{name}'")
                continue

            lat, lon = coords

            if name in seen_garages:
                continue
            seen_garages.add(name)

            capacity_total = item.get("totalPlaces")
            available = item.get("freePlaces")

            facility = {
                "id": f"utrecht_proute_{name.replace(' ', '_').lower()}",
                "source": "utrecht",
                "source_detail": "P-route Stallingsnet",
                "name": f"P+R {name}" if "Stationsplein" in name else f"Parkeergarage {name}",
                "type": "garage",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "latitude": lat,
                "longitude": lon,
                "municipality": "Utrecht",
                "province": "Utrecht",
                "capacity": {"total": int(capacity_total)} if capacity_total else None,
                "available": int(available) if available else None,
                "has_realtime": True,
                "realtime_updated": item.get("time", datetime.now(timezone.utc).isoformat()),
                "is_paid": True,
                "last_updated": datetime.now(timezone.utc).isoformat()
            }
            facilities.append(facility)

        print(f"  Found {len(facilities)} P-route facilities")
        return facilities

    except requests.exceptions.RequestException as e:
        print(f"  Error fetching P-route data: {e}")
        return []


def fetch_parkeerautomaten() -> list:
    """Fetch parking meter locations from Utrecht Open Data."""
    print("Fetching Utrecht parkeerautomaten...")

    try:
        # Try CKAN datastore API
        params = {
            "resource_id": UTRECHT_AUTOMATEN_RESOURCE,
            "limit": 10000
        }
        response = requests.get(UTRECHT_AUTOMATEN_API, params=params, timeout=60)

        if response.status_code != 200:
            # Fallback: try direct WFS
            print("  Trying alternative WFS endpoint...")
            wfs_url = "https://geodata.utrecht.nl/geoserver/wfs"
            wfs_params = {
                "service": "WFS",
                "version": "2.0.0",
                "request": "GetFeature",
                "typeName": "parkeerautomaten",
                "outputFormat": "application/json",
                "srsName": "EPSG:4326"
            }
            response = requests.get(wfs_url, params=wfs_params, timeout=60)

        response.raise_for_status()
        data = response.json()

        # Handle CKAN vs WFS response format
        if "result" in data:
            records = data["result"].get("records", [])
        elif "features" in data:
            records = data["features"]
        else:
            records = data if isinstance(data, list) else []

        automaten = []
        for record in records:
            # Handle WFS feature format
            if "properties" in record:
                props = record["properties"]
                geom = record.get("geometry", {})
                coords = geom.get("coordinates", [])
                if coords:
                    lon, lat = coords[0], coords[1] if len(coords) >= 2 else (None, None)
                else:
                    lat, lon = None, None
            else:
                props = record
                lat = props.get("latitude") or props.get("lat") or props.get("y")
                lon = props.get("longitude") or props.get("lng") or props.get("lon") or props.get("x")

            if not lat or not lon:
                continue

            try:
                lat = float(lat)
                lon = float(lon)
            except (ValueError, TypeError):
                continue

            automaat = {
                "id": f"utrecht_automaat_{props.get('id', props.get('automaatnummer', ''))}",
                "source": "utrecht",
                "source_detail": "Parkeerautomaten",
                "name": props.get("adres", props.get("straatnaam", "")),
                "type": "parking_meter",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "latitude": lat,
                "longitude": lon,
                "municipality": "Utrecht",
                "province": "Utrecht",
                "neighborhood": props.get("parkeerrayon", props.get("wijk", "")),
                "is_paid": True,
                "last_updated": datetime.now(timezone.utc).isoformat()
            }
            automaten.append(automaat)

        print(f"  Found {len(automaten)} parking meters")
        return automaten

    except requests.exceptions.RequestException as e:
        print(f"  Error fetching parkeerautomaten: {e}")
        return []


def fetch_rdw_utrecht_garages() -> list:
    """Fetch Utrecht parking garages from RDW national database."""
    print("Fetching Utrecht garages from RDW...")

    try:
        # Query RDW for Utrecht area manager
        params = {
            "$where": "areadesc LIKE '%Utrecht%' OR areamanagerid = '303'",
            "$limit": 1000
        }
        response = requests.get(RDW_GEBIEDB_API, params=params, timeout=60)
        response.raise_for_status()

        areas = response.json()
        print(f"  Found {len(areas)} RDW areas for Utrecht")

        # Note: These will be processed by the main RDW script
        # This is just to verify Utrecht data exists
        return areas

    except requests.exceptions.RequestException as e:
        print(f"  Error fetching RDW data: {e}")
        return []


def main():
    output_dir = Path(__file__).parent.parent / "data"
    output_dir.mkdir(exist_ok=True)

    all_facilities = []

    # Fetch P-route real-time data
    proute_data = fetch_pbroute_data()
    all_facilities.extend(proute_data)

    # Fetch parking meters (optional, can be noisy)
    # automaten = fetch_parkeerautomaten()
    # all_facilities.extend(automaten)

    # Generate statistics
    stats = {
        "total": len(all_facilities),
        "by_type": {},
        "with_realtime": 0,
        "with_capacity": 0,
    }

    for f in all_facilities:
        ptype = f["type"]
        stats["by_type"][ptype] = stats["by_type"].get(ptype, 0) + 1

        if f.get("has_realtime"):
            stats["with_realtime"] += 1
        if f.get("capacity"):
            stats["with_capacity"] += 1

    print(f"\n=== Utrecht Parking Data Summary ===")
    print(f"Total facilities: {stats['total']}")
    print(f"By type:")
    for ptype, count in sorted(stats["by_type"].items(), key=lambda x: -x[1]):
        print(f"  {ptype}: {count}")
    print(f"With real-time data: {stats['with_realtime']}")
    print(f"With capacity: {stats['with_capacity']}")

    # Save data
    output_file = output_dir / "utrecht_parking.json"
    output = {
        "metadata": {
            "source": "Utrecht Open Data (P-route via Stallingsnet)",
            "city": "Utrecht",
            "province": "Utrecht",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "stats": stats
        },
        "features": all_facilities
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
                "id": f["id"],
                "geometry": f["geometry"],
                "properties": {k: v for k, v in f.items() if k != "geometry"}
            }
            for f in all_facilities
            if f["geometry"]
        ]
    }

    geojson_file = output_dir / "utrecht_parking.geojson"
    with open(geojson_file, "w", encoding="utf-8") as f:
        json.dump(geojson_output, f, ensure_ascii=False)

    print(f"GeoJSON saved to {geojson_file}")

    return stats


if __name__ == "__main__":
    main()

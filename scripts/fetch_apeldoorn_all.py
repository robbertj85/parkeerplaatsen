#!/usr/bin/env python3
"""
Fetch ALL Apeldoorn parking data from every available source.

Sources:
1. BGT (PDOK) - Individual parkeervlak polygons at cm accuracy
2. OpenStreetMap - All parking features (1200+ with polygons)
3. RDW Socrata - Zone polygons, capacity, tariffs, addresses
4. RDW SPDP v2 - Real-time occupancy + facility data
"""

import json
import requests
import time
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPT_DIR.parent / "car-parking-map" / "public"
DATA_DIR = SCRIPT_DIR.parent / "data"

HEADERS = {
    "Accept": "application/json",
    "User-Agent": "ParkeerplaatsenNL/1.0 (parking data aggregator)"
}

# Apeldoorn bounding box (generous)
APELDOORN_BBOX = {
    "south": 52.15,
    "west": 5.88,
    "north": 52.28,
    "east": 6.10,
}

AREA_MANAGER_ID = "200"  # Apeldoorn's RDW area manager ID

# ============================================================
# SOURCE 1: BGT via PDOK - Individual parking surface polygons
# ============================================================

def fetch_bgt_parkeervlakken():
    """
    Fetch individual parking surface polygons from BGT (Basisregistratie
    Grootschalige Topografie) via PDOK OGC API Features.

    BGT contains 'wegdeel' features with functie=parkeervlak - these are
    centimeter-accurate polygons of physical parking surfaces.

    Uses cursor-based pagination (PDOK doesn't support offset).
    """
    print("\n" + "=" * 60)
    print("SOURCE 1: BGT Parkeervlakken (PDOK)")
    print("=" * 60)

    bbox = APELDOORN_BBOX
    bbox_str = f"{bbox['west']},{bbox['south']},{bbox['east']},{bbox['north']}"

    base_url = "https://api.pdok.nl/lv/bgt/ogc/v1/collections/wegdeel/items"
    features = []
    limit = 100
    page = 0
    max_pages = 1000
    next_url = None

    while page < max_pages:
        if next_url:
            resp = requests.get(next_url, headers=HEADERS, timeout=60)
        else:
            params = {
                "bbox": bbox_str,
                "limit": limit,
                "f": "json",
            }
            resp = requests.get(base_url, params=params, headers=HEADERS, timeout=60)

        try:
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"  Error on page {page}: {e}")
            break

        page_features = data.get("features", [])
        if not page_features:
            break

        for f in page_features:
            props = f.get("properties", {})
            if props.get("functie") == "parkeervlak":
                features.append(f)

        # Find next cursor link
        next_url = None
        for link in data.get("links", []):
            if link.get("rel") == "next":
                next_url = link.get("href")
                break

        page += 1
        if page % 10 == 0:
            print(f"  Page {page}: scanned {page * limit} wegdeel features, found {len(features)} parkeervlakken...")

        if not next_url or len(page_features) < limit:
            break

        time.sleep(0.05)

    print(f"  Total BGT parkeervlakken: {len(features)} (scanned {page * limit}+ wegdeel features)")
    return features


def convert_bgt_features(bgt_features):
    """Convert BGT features to our standard GeoJSON format."""
    results = []
    for f in bgt_features:
        props = f.get("properties", {})
        geom = f.get("geometry", {})

        # BGT uses different geometry types
        geom_type = geom.get("type", "")
        coords = geom.get("coordinates", [])

        if not coords:
            continue

        # Calculate centroid for lat/lon
        lat, lon = calculate_centroid(geom)
        if not lat or not lon:
            continue

        bgt_id = props.get("lokaal_id", props.get("identificatie", props.get("id", "")))
        surface = props.get("fysiek_voorkomen", props.get("fysiekVoorkomen", ""))
        status = props.get("status", "")
        plus_functie = props.get("plus_functie", "")

        feature = {
            "type": "Feature",
            "geometry": geom,  # Keep original polygon geometry
            "properties": {
                "id": f"bgt-{bgt_id}",
                "name": f"Parkeervlak",
                "type": "parking_space",
                "latitude": lat,
                "longitude": lon,
                "municipality": "Apeldoorn",
                "province": "Gelderland",
                "source": "bgt",
                "source_detail": "BGT/PDOK - Basisregistratie Grootschalige Topografie",
                "bgt_id": str(bgt_id),
                "surface_type": surface,
                "bgt_status": status,
                "last_updated": datetime.now(timezone.utc).isoformat(),
            }
        }
        results.append(feature)

    return results


# ============================================================
# SOURCE 2: OpenStreetMap - All parking features
# ============================================================

def fetch_osm_all_parking():
    """
    Fetch ALL parking features from OpenStreetMap for Apeldoorn.
    Includes parking lots, garages, street parking, and individual spaces.
    Uses 'out geom' to get full polygon geometries.
    """
    print("\n" + "=" * 60)
    print("SOURCE 2: OpenStreetMap (All Parking)")
    print("=" * 60)

    # Try multiple Overpass servers for reliability
    overpass_servers = [
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass-api.de/api/interpreter",
    ]

    bbox = APELDOORN_BBOX
    # Fetch all parking amenities with full geometry using bbox (faster than area)
    query = f"""
    [out:json][timeout:300];
    (
      nwr["amenity"="parking"]({bbox['south']},{bbox['west']},{bbox['north']},{bbox['east']});
      nwr["amenity"="parking_space"]({bbox['south']},{bbox['west']},{bbox['north']},{bbox['east']});
      nwr["amenity"="parking_entrance"]({bbox['south']},{bbox['west']},{bbox['north']},{bbox['east']});
    );
    out body geom;
    """

    print("  Fetching from Overpass API (this may take a moment)...")
    resp = None
    for server in overpass_servers:
        try:
            print(f"  Trying {server}...")
            resp = requests.post(server, data={"data": query}, timeout=300)
            resp.raise_for_status()
            break
        except Exception as e:
            print(f"    Failed: {e}")
            resp = None
            continue

    if not resp:
        raise Exception("All Overpass servers failed")
    resp.raise_for_status()
    data = resp.json()

    elements = data.get("elements", [])
    print(f"  Total OSM elements: {len(elements)}")

    # Break down by type
    by_type = {}
    for e in elements:
        tags = e.get("tags", {})
        amenity = tags.get("amenity", "other")
        parking = tags.get("parking", "")
        key = f"{amenity}" + (f"/{parking}" if parking else "")
        by_type[key] = by_type.get(key, 0) + 1

    for k, v in sorted(by_type.items()):
        print(f"    {k}: {v}")

    return elements


def convert_osm_features(osm_elements):
    """Convert OSM elements to our standard GeoJSON format with polygon geometries."""
    results = []

    for elem in osm_elements:
        tags = elem.get("tags", {})
        osm_type = elem.get("type", "")
        osm_id = elem.get("id", "")

        # Skip bicycle parking
        if tags.get("amenity") == "bicycle_parking":
            continue

        name = tags.get("name", "")
        amenity = tags.get("amenity", "")
        parking_type_osm = tags.get("parking", "")
        fee = tags.get("fee", "")
        access = tags.get("access", "")
        capacity = tags.get("capacity", "")
        operator = tags.get("operator", "")
        surface = tags.get("surface", "")
        opening_hours = tags.get("opening_hours", "")
        max_height = tags.get("maxheight", "")
        wheelchair = tags.get("wheelchair", "")
        lit = tags.get("lit", "")
        covered = tags.get("covered", "")
        supervised = tags.get("supervised", "")

        # Determine our parking type
        if parking_type_osm in ("multi-storey", "underground"):
            ptype = "garage"
        elif parking_type_osm == "park_and_ride":
            ptype = "p_and_r"
        elif amenity == "parking_space":
            ptype = "parking_space"
        elif amenity == "parking_entrance":
            ptype = "parking_space"
        elif fee == "yes" or tags.get("parking:fee") == "yes":
            ptype = "street_paid"
        elif parking_type_osm == "street_side" or parking_type_osm == "lane":
            ptype = "street_free"
        elif parking_type_osm == "surface":
            ptype = "surface"
        else:
            ptype = "surface"

        if not name:
            name = tags.get("description", PARKING_LABELS.get(ptype, "Parking"))

        # Build geometry
        geom = build_osm_geometry(elem)
        if not geom:
            continue

        lat, lon = calculate_centroid(geom)
        if not lat or not lon:
            continue

        props = {
            "id": f"osm-{osm_type[0]}{osm_id}",
            "name": name,
            "type": ptype,
            "latitude": lat,
            "longitude": lon,
            "municipality": "Apeldoorn",
            "province": "Gelderland",
            "source": "osm",
            "source_detail": "OpenStreetMap community contributors",
            "osm_id": f"{osm_type}/{osm_id}",
            "osm_type": osm_type,
            "last_updated": datetime.now(timezone.utc).isoformat(),
        }

        if capacity:
            try:
                props["capacity"] = {"total": int(capacity)}
            except ValueError:
                pass
        if operator:
            props["operator"] = operator
        if fee:
            props["fee"] = fee
            props["is_paid"] = fee == "yes"
        if access:
            props["access"] = access
        if surface:
            props["surface_type"] = surface
        if opening_hours:
            props["opening_hours"] = opening_hours
        if max_height:
            try:
                props["max_height"] = int(float(max_height.replace("m", "").strip()) * 100)
            except ValueError:
                pass
        if wheelchair:
            props["wheelchair"] = wheelchair
        if lit:
            props["lit"] = lit
        if covered:
            props["covered"] = covered == "yes"
        if supervised:
            props["supervised"] = supervised == "yes"

        feature = {
            "type": "Feature",
            "geometry": geom,
            "properties": props,
        }
        results.append(feature)

    return results


PARKING_LABELS = {
    "garage": "Parking Garage",
    "surface": "Surface Lot",
    "street_paid": "Street (Paid)",
    "street_free": "Street (Free)",
    "p_and_r": "P+R",
    "parking_space": "Parking Space",
}


def build_osm_geometry(elem):
    """Build GeoJSON geometry from an OSM element."""
    osm_type = elem.get("type", "")

    if osm_type == "node":
        lat = elem.get("lat")
        lon = elem.get("lon")
        if lat and lon:
            return {"type": "Point", "coordinates": [lon, lat]}

    elif osm_type == "way":
        # Ways have 'geometry' array with lat/lon pairs from 'out geom'
        geom = elem.get("geometry", [])
        if geom and len(geom) >= 3:
            coords = [[p["lon"], p["lat"]] for p in geom]
            # Close the ring if not closed
            if coords[0] != coords[-1]:
                coords.append(coords[0])
            return {"type": "Polygon", "coordinates": [coords]}
        # Fallback to bounds/center
        bounds = elem.get("bounds", {})
        if bounds:
            center = elem.get("center", {})
            lat = center.get("lat") or (bounds.get("minlat", 0) + bounds.get("maxlat", 0)) / 2
            lon = center.get("lon") or (bounds.get("minlon", 0) + bounds.get("maxlon", 0)) / 2
            return {"type": "Point", "coordinates": [lon, lat]}

    elif osm_type == "relation":
        # Relations can have members with geometry
        members = elem.get("members", [])
        outer_rings = []
        for member in members:
            if member.get("role") == "outer" and member.get("geometry"):
                coords = [[p["lon"], p["lat"]] for p in member["geometry"]]
                if coords[0] != coords[-1]:
                    coords.append(coords[0])
                outer_rings.append(coords)

        if len(outer_rings) == 1:
            return {"type": "Polygon", "coordinates": outer_rings}
        elif len(outer_rings) > 1:
            return {"type": "MultiPolygon", "coordinates": [[ring] for ring in outer_rings]}

        # Fallback
        bounds = elem.get("bounds", {})
        if bounds:
            lat = (bounds.get("minlat", 0) + bounds.get("maxlat", 0)) / 2
            lon = (bounds.get("minlon", 0) + bounds.get("maxlon", 0)) / 2
            if lat and lon:
                return {"type": "Point", "coordinates": [lon, lat]}

    return None


# ============================================================
# SOURCE 3: RDW Socrata - Zones, capacity, tariffs, addresses
# ============================================================

def fetch_rdw_zones():
    """
    Fetch parking zone polygon geometries from RDW Open Data.
    Dataset: SPECIFICATIES PARKEERGEBIED (nsk3-v9n7)
    """
    print("\n" + "=" * 60)
    print("SOURCE 3a: RDW Zones & Geometries")
    print("=" * 60)

    url = "https://opendata.rdw.nl/resource/nsk3-v9n7.json"
    params = {
        "$where": f"areamanagerid='{AREA_MANAGER_ID}'",
        "$limit": 5000,
    }

    resp = requests.get(url, params=params, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    print(f"  Zone records: {len(data)}")
    return data


def fetch_rdw_capacity():
    """
    Fetch parking area usage/capacity data.
    Dataset: TARIEFDEEL / Usage areas (b3us-f26s)
    """
    print("\n" + "=" * 60)
    print("SOURCE 3b: RDW Capacity & Usage")
    print("=" * 60)

    url = "https://opendata.rdw.nl/resource/b3us-f26s.json"
    params = {
        "$where": f"areamanagerid='{AREA_MANAGER_ID}'",
        "$limit": 5000,
    }

    resp = requests.get(url, params=params, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    print(f"  Usage/capacity records: {len(data)}")
    return data


def fetch_rdw_tariffs():
    """
    Fetch tariff definitions.
    Dataset: 534e-5vdg
    """
    print("\n" + "=" * 60)
    print("SOURCE 3c: RDW Tariffs")
    print("=" * 60)

    url = "https://opendata.rdw.nl/resource/534e-5vdg.json"
    params = {
        "areamanagerid": AREA_MANAGER_ID,
        "$limit": 5000,
    }

    resp = requests.get(url, params=params, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    print(f"  Tariff records: {len(data)}")
    return data


def fetch_rdw_area_descriptions():
    """
    Fetch area descriptions (names) for all Apeldoorn areas.
    Dataset: adw6-9hsg
    """
    print("\n" + "=" * 60)
    print("SOURCE 3d: RDW Area Descriptions")
    print("=" * 60)

    url = "https://opendata.rdw.nl/resource/adw6-9hsg.json"
    params = {
        "$where": f"areamanagerid='{AREA_MANAGER_ID}'",
        "$limit": 5000,
    }

    resp = requests.get(url, params=params, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    print(f"  Area description records: {len(data)}")
    return data


def fetch_rdw_garages():
    """
    Fetch geographic garage locations.
    Dataset: GEO Parkeer Garages (t5pc-eb34)
    """
    print("\n" + "=" * 60)
    print("SOURCE 3e: RDW Garage Locations")
    print("=" * 60)

    url = "https://opendata.rdw.nl/resource/t5pc-eb34.json"
    params = {
        "areamanagerid": AREA_MANAGER_ID,
        "$limit": 100,
    }

    resp = requests.get(url, params=params, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    print(f"  Garage records: {len(data)}")
    for g in data:
        loc = g.get("location", {})
        print(f"    {g.get('areadesc', 'N/A')} ({g.get('areaid')}) - lat={loc.get('latitude')}, lon={loc.get('longitude')}")
    return data


def fetch_rdw_addresses():
    """
    Fetch parking facility addresses.
    Dataset: PARKEERADRES (ygq4-hh5q)
    """
    print("\n" + "=" * 60)
    print("SOURCE 3e: RDW Addresses")
    print("=" * 60)

    url = "https://opendata.rdw.nl/resource/ygq4-hh5q.json"
    params = {
        "place": "Apeldoorn",
        "$limit": 200,
    }

    resp = requests.get(url, params=params, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    print(f"  Address records: {len(data)}")
    for a in data:
        print(f"    {a.get('streetname', '')} {a.get('housenumber', '')} - {a.get('zipcode', '')}")
    return data


def convert_rdw_zones(zone_records, capacity_records, tariff_records, garages, addresses, area_descriptions=None):
    """Convert RDW zone data to GeoJSON features with polygon geometries."""
    results = []

    # Build lookup maps
    capacity_map = {}
    for c in capacity_records:
        area_id = c.get("areaid", "")
        capacity_map[area_id] = c

    tariff_map = {}
    for t in tariff_records:
        fare_calc = t.get("farecalculationcode", "")
        tariff_map[fare_calc] = t

    garage_map = {}
    for g in garages:
        area_id = g.get("areaid", "")
        garage_map[area_id] = g

    address_map = {}
    for a in addresses:
        ref = a.get("parkingaddressreference", "")
        address_map[ref] = a

    desc_map = {}
    for d in (area_descriptions or []):
        area_id = d.get("areaid", "")
        desc_map[area_id] = d.get("areadesc", "")

    for zone in zone_records:
        area_id = zone.get("areaid", "")
        area_desc = desc_map.get(area_id, zone.get("areadesc", area_id))
        geom_str = zone.get("areageometryastext", zone.get("areageometrycoordinates", ""))

        # Parse WKT geometry if present
        geom = parse_wkt_geometry(geom_str) if geom_str else None

        if not geom:
            continue

        lat, lon = calculate_centroid(geom)
        if not lat or not lon:
            continue

        # Classify zone type
        area_desc_lower = area_desc.lower()
        if "garage" in area_desc_lower or area_id.startswith("GAR"):
            ptype = "garage"
        elif "p+r" in area_desc_lower or "p&r" in area_desc_lower:
            ptype = "p_and_r"
        elif "terrein" in area_desc_lower or area_id.endswith("_TER"):
            ptype = "surface"
        elif "straatparkeren" in area_desc_lower or "zone" in area_desc_lower:
            ptype = "street_paid"
        elif "carpool" in area_desc_lower:
            ptype = "p_and_r"
        else:
            ptype = "surface"

        # Get capacity info
        cap_info = capacity_map.get(area_id, {})
        capacity = cap_info.get("capacity")
        usage_id = cap_info.get("usageid", "")

        # Get tariff info
        fare_code = cap_info.get("farecalculationcode", "")
        tariff_info = tariff_map.get(fare_code, {})
        amount = tariff_info.get("amountfarepart")
        step_size = tariff_info.get("stepsizefarepart")

        # Get garage location
        garage_info = garage_map.get(area_id, {})

        # Get address
        addr_ref = zone.get("parkingaddressreference", "")
        addr_info = address_map.get(addr_ref, {})
        address_str = ""
        if addr_info:
            street = addr_info.get("streetname", "")
            house = addr_info.get("housenumber", "")
            zipcode = addr_info.get("zipcode", "")
            address_str = f"{street} {house}, {zipcode} Apeldoorn".strip()

        start_date = zone.get("startdatearea", zone.get("startdataarea", ""))
        end_date = zone.get("enddatearea", zone.get("enddataarea", ""))

        props = {
            "id": f"rdw-{area_id}",
            "name": area_desc,
            "type": ptype,
            "latitude": lat,
            "longitude": lon,
            "municipality": "Apeldoorn",
            "province": "Gelderland",
            "source": "rdw",
            "source_detail": "RDW Open Data (Socrata) - Nationaal Parkeerregister",
            "rdw_area_id": area_id,
            "rdw_area_manager_id": AREA_MANAGER_ID,
            "usage_id": usage_id,
            "last_updated": datetime.now(timezone.utc).isoformat(),
        }

        if capacity:
            try:
                props["capacity"] = {"total": int(capacity)}
            except (ValueError, TypeError):
                pass
        if amount:
            try:
                props["tariff_per_hour"] = float(amount)
            except (ValueError, TypeError):
                pass
        if step_size:
            props["tariff_step_minutes"] = step_size
        if fare_code:
            props["fare_code"] = fare_code
        if address_str:
            props["address"] = address_str
        if start_date:
            props["valid_from"] = start_date
        if end_date and end_date != "29991231":
            props["valid_until"] = end_date

        feature = {
            "type": "Feature",
            "geometry": geom,
            "properties": props,
        }
        results.append(feature)

    return results


# ============================================================
# SOURCE 4: RDW SPDP v2 - Real-time occupancy
# ============================================================

def fetch_spdp_apeldoorn():
    """Fetch ALL Apeldoorn facilities from SPDP v2 (not just garages)."""
    print("\n" + "=" * 60)
    print("SOURCE 4: RDW SPDP v2 (Real-time)")
    print("=" * 60)

    print("  Fetching SPDP v2 index...")
    resp = requests.get("https://npropendata.rdw.nl/parkingdata/v2", headers=HEADERS, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    facilities = data.get("ParkingFacilities", [])
    apeldoorn = [f for f in facilities if "apeldoorn" in f.get("name", "").lower()]
    print(f"  Apeldoorn facilities in SPDP: {len(apeldoorn)}")

    has_dynamic = [f for f in apeldoorn if f.get("dynamicDataUrl")]
    public_dynamic = [f for f in has_dynamic if not f.get("limitedAccess")]
    limited_dynamic = [f for f in has_dynamic if f.get("limitedAccess")]

    print(f"    With real-time (public): {len(public_dynamic)}")
    print(f"    With real-time (limited access): {len(limited_dynamic)}")
    print(f"    Static only: {len(apeldoorn) - len(has_dynamic)}")

    return apeldoorn


def fetch_spdp_static(uuid):
    """Fetch static data for a specific SPDP facility."""
    url = f"https://npropendata.rdw.nl/parkingdata/v2/static/{uuid}"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code == 401:
            return None  # Limited access
        resp.raise_for_status()
        return resp.json()
    except Exception:
        return None


def convert_spdp_features(spdp_facilities):
    """Convert SPDP facilities to GeoJSON features."""
    results = []

    print(f"\n  Fetching static data for {len(spdp_facilities)} facilities...")
    for i, facility in enumerate(spdp_facilities):
        name = facility.get("name", "")
        uuid = facility.get("identifier", "")
        has_dynamic = bool(facility.get("dynamicDataUrl"))
        limited_access = facility.get("limitedAccess", False)

        static = fetch_spdp_static(uuid)
        if not static:
            if limited_access:
                print(f"  [{i+1}/{len(spdp_facilities)}] SKIP (limited access): {name}")
            else:
                print(f"  [{i+1}/{len(spdp_facilities)}] SKIP (no data): {name}")
            continue

        info = static.get("parkingFacilityInformation", {})
        loc = info.get("locationForDisplay", {})
        lat = loc.get("latitude")
        lon = loc.get("longitude")

        if not lat or not lon:
            print(f"  [{i+1}/{len(spdp_facilities)}] SKIP (no coords): {name}")
            continue

        specs = info.get("specifications", [])
        capacity = specs[0].get("capacity") if specs else None
        max_height = specs[0].get("minimumHeightInMeters") if specs else None

        op = info.get("operator", {})
        operator = op.get("name", "")
        description = info.get("description", "")

        # Classify type from name
        name_lower = name.lower()
        if "p+r" in name_lower or "p&r" in name_lower:
            ptype = "p_and_r"
        elif "carpool" in name_lower or "carpoolplaats" in name_lower:
            ptype = "p_and_r"
        elif "garage" in name_lower or name.startswith("APELDOORN-"):
            ptype = "garage"
        elif "p-terrein" in name_lower or "terrein" in name_lower:
            ptype = "surface"
        elif "straatparkeren" in name_lower or "zone" in name_lower:
            ptype = "street_paid"
        elif "afrit" in name_lower:
            ptype = "p_and_r"
        else:
            ptype = "surface"

        props = {
            "id": f"spdp-{uuid[:8]}",
            "name": name,
            "type": ptype,
            "latitude": lat,
            "longitude": lon,
            "municipality": "Apeldoorn",
            "province": "Gelderland",
            "source": "rdw_spdp",
            "source_detail": "RDW SPDP v2 (NPR Open Data) - npropendata.rdw.nl",
            "uuid": uuid,
            "has_realtime": has_dynamic and not limited_access,
            "limited_access": limited_access,
            "last_updated": datetime.now(timezone.utc).isoformat(),
        }

        if has_dynamic:
            props["realtime_url"] = facility.get("dynamicDataUrl")
        if capacity:
            props["capacity"] = {"total": capacity}
        if max_height:
            props["max_height"] = int(max_height * 100)
        if operator:
            props["operator"] = operator
        if description:
            props["description"] = description

        rt = "LIVE" if has_dynamic and not limited_access else ("LIMITED" if limited_access else "static")
        print(f"  [{i+1}/{len(spdp_facilities)}] {rt}: {name}")

        feature = {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": props,
        }
        results.append(feature)
        time.sleep(0.05)

    return results


# ============================================================
# Utilities
# ============================================================

def parse_wkt_geometry(wkt_str):
    """Parse WKT geometry string (POLYGON, MULTIPOLYGON, POINT) to GeoJSON."""
    if not wkt_str or not isinstance(wkt_str, str):
        return None

    wkt_str = wkt_str.strip()

    try:
        if wkt_str.upper().startswith("POINT"):
            # POINT(lon lat)
            coords_str = wkt_str.split("(")[1].rstrip(")")
            parts = coords_str.strip().split()
            lon, lat = float(parts[0]), float(parts[1])
            return {"type": "Point", "coordinates": [lon, lat]}

        elif wkt_str.upper().startswith("MULTIPOLYGON"):
            # MULTIPOLYGON(((lon lat, lon lat, ...)),((lon lat, ...)))
            inner = wkt_str.split("MULTIPOLYGON")[1].strip()
            if inner.startswith("(("):
                inner = inner[1:-1]  # Remove outer parens

            polygons = []
            # Split on ")),((" to get individual polygons
            poly_strs = inner.split(")),((")
            for ps in poly_strs:
                ps = ps.strip("()")
                ring = parse_coord_ring(ps)
                if ring:
                    polygons.append([ring])

            if len(polygons) == 1:
                return {"type": "Polygon", "coordinates": polygons[0]}
            elif len(polygons) > 1:
                return {"type": "MultiPolygon", "coordinates": polygons}

        elif wkt_str.upper().startswith("POLYGON"):
            inner = wkt_str.split("POLYGON")[1].strip()
            inner = inner.strip("()")

            # Handle multiple rings separated by ),(
            ring_strs = inner.split("),(")
            rings = []
            for rs in ring_strs:
                rs = rs.strip("()")
                ring = parse_coord_ring(rs)
                if ring:
                    rings.append(ring)

            if rings:
                return {"type": "Polygon", "coordinates": rings}

    except Exception as e:
        pass

    return None


def parse_coord_ring(coord_str):
    """Parse a coordinate ring string 'lon lat, lon lat, ...' into coordinate array."""
    coords = []
    for pair in coord_str.split(","):
        pair = pair.strip()
        if not pair:
            continue
        parts = pair.split()
        if len(parts) >= 2:
            try:
                lon, lat = float(parts[0]), float(parts[1])
                coords.append([lon, lat])
            except ValueError:
                continue

    if len(coords) >= 3:
        # Close ring if not closed
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        return coords
    return None


def calculate_centroid(geom):
    """Calculate the centroid of a GeoJSON geometry."""
    geom_type = geom.get("type", "")
    coords = geom.get("coordinates", [])

    if geom_type == "Point":
        return coords[1], coords[0]  # lat, lon

    elif geom_type == "Polygon":
        ring = coords[0] if coords else []
        if not ring:
            return None, None
        lons = [c[0] for c in ring]
        lats = [c[1] for c in ring]
        return sum(lats) / len(lats), sum(lons) / len(lons)

    elif geom_type == "MultiPolygon":
        all_lats = []
        all_lons = []
        for polygon in coords:
            ring = polygon[0] if polygon else []
            for c in ring:
                all_lons.append(c[0])
                all_lats.append(c[1])
        if all_lats:
            return sum(all_lats) / len(all_lats), sum(all_lons) / len(all_lons)

    return None, None


# ============================================================
# Main
# ============================================================

def main():
    print("=" * 60)
    print("APELDOORN COMPREHENSIVE PARKING DATA FETCHER")
    print("=" * 60)
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print(f"Bounding box: {APELDOORN_BBOX}")

    all_features = []

    # --- Source 1: BGT parkeervlakken ---
    try:
        bgt_raw = fetch_bgt_parkeervlakken()
        bgt_features = convert_bgt_features(bgt_raw)
        all_features.extend(bgt_features)
        print(f"  => {len(bgt_features)} BGT parking surface features")
    except Exception as e:
        print(f"  ERROR fetching BGT: {e}")
        bgt_features = []

    # --- Source 2: OpenStreetMap ---
    try:
        osm_raw = fetch_osm_all_parking()
        osm_features = convert_osm_features(osm_raw)
        all_features.extend(osm_features)
        print(f"  => {len(osm_features)} OSM parking features")
    except Exception as e:
        print(f"  ERROR fetching OSM: {e}")
        osm_features = []

    # --- Source 3: RDW Socrata ---
    try:
        rdw_zones = fetch_rdw_zones()
        rdw_capacity = fetch_rdw_capacity()
        rdw_tariffs = fetch_rdw_tariffs()
        rdw_area_descs = fetch_rdw_area_descriptions()
        rdw_garages = fetch_rdw_garages()
        rdw_addresses = fetch_rdw_addresses()
        rdw_features = convert_rdw_zones(rdw_zones, rdw_capacity, rdw_tariffs, rdw_garages, rdw_addresses, rdw_area_descs)
        all_features.extend(rdw_features)
        print(f"  => {len(rdw_features)} RDW zone/facility features")
    except Exception as e:
        print(f"  ERROR fetching RDW Socrata: {e}")
        rdw_features = []
        rdw_capacity = []
        rdw_tariffs = []
        rdw_garages = []
        rdw_addresses = []

    # --- Source 4: SPDP v2 ---
    try:
        spdp_raw = fetch_spdp_apeldoorn()
        spdp_features = convert_spdp_features(spdp_raw)
        all_features.extend(spdp_features)
        print(f"  => {len(spdp_features)} SPDP facility features")
    except Exception as e:
        print(f"  ERROR fetching SPDP: {e}")
        spdp_features = []

    # --- Statistics ---
    by_source = {}
    by_type = {}
    polygon_count = 0
    point_count = 0

    for f in all_features:
        src = f["properties"].get("source", "unknown")
        ptype = f["properties"].get("type", "other")
        by_source[src] = by_source.get(src, 0) + 1
        by_type[ptype] = by_type.get(ptype, 0) + 1
        if f["geometry"]["type"] in ("Polygon", "MultiPolygon"):
            polygon_count += 1
        else:
            point_count += 1

    realtime_count = sum(1 for f in all_features if f["properties"].get("has_realtime"))

    # --- Build output GeoJSON ---
    geojson = {
        "type": "FeatureCollection",
        "metadata": {
            "municipality": "Apeldoorn",
            "province": "Gelderland",
            "country": "NL",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "total_features": len(all_features),
            "polygon_features": polygon_count,
            "point_features": point_count,
            "with_realtime": realtime_count,
            "by_source": by_source,
            "by_type": by_type,
            "sources": {
                "bgt": {
                    "name": "BGT (Basisregistratie Grootschalige Topografie)",
                    "provider": "PDOK / Kadaster",
                    "url": "https://api.pdok.nl/lv/bgt/ogc/v1",
                    "description": "Individual parking surface polygons at centimeter accuracy",
                    "count": len(bgt_features),
                },
                "osm": {
                    "name": "OpenStreetMap",
                    "provider": "OpenStreetMap community",
                    "url": "https://www.openstreetmap.org",
                    "description": "Community-mapped parking features with polygons and metadata",
                    "count": len(osm_features),
                },
                "rdw": {
                    "name": "RDW Open Data (Socrata)",
                    "provider": "RDW / NPR",
                    "url": "https://opendata.rdw.nl",
                    "description": "Parking zone polygons, capacity, tariffs, and addresses",
                    "count": len(rdw_features),
                },
                "rdw_spdp": {
                    "name": "RDW SPDP v2",
                    "provider": "RDW / NPR",
                    "url": "https://npropendata.rdw.nl/parkingdata/v2",
                    "description": "Real-time parking occupancy and facility data",
                    "count": len(spdp_features),
                },
            },
        },
        "features": all_features,
    }

    # --- Save outputs ---
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Main output
    output_file = OUTPUT_DIR / "apeldoorn_parking.geojson"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(geojson, f, indent=2, ensure_ascii=False)

    # Also save raw data per source for debugging
    raw_dir = DATA_DIR / "apeldoorn"
    raw_dir.mkdir(parents=True, exist_ok=True)

    with open(raw_dir / "bgt_parkeervlakken.json", "w") as f:
        json.dump({"count": len(bgt_features), "features": bgt_features}, f, indent=2, ensure_ascii=False)

    with open(raw_dir / "osm_parking.json", "w") as f:
        json.dump({"count": len(osm_features), "features": osm_features}, f, indent=2, ensure_ascii=False)

    with open(raw_dir / "rdw_zones.json", "w") as f:
        json.dump({"capacity": rdw_capacity, "tariffs": rdw_tariffs, "garages": rdw_garages, "addresses": rdw_addresses}, f, indent=2, ensure_ascii=False)

    with open(raw_dir / "spdp_facilities.json", "w") as f:
        json.dump({"count": len(spdp_features), "features": spdp_features}, f, indent=2, ensure_ascii=False)

    # --- Print summary ---
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Total features: {len(all_features)}")
    print(f"  Polygon features: {polygon_count}")
    print(f"  Point features: {point_count}")
    print(f"  With real-time data: {realtime_count}")
    print(f"\nBy source:")
    for src, count in sorted(by_source.items()):
        print(f"  {src}: {count}")
    print(f"\nBy type:")
    for ptype, count in sorted(by_type.items()):
        print(f"  {ptype}: {count}")
    print(f"\nSaved to: {output_file}")
    print(f"Raw data: {raw_dir}/")


if __name__ == "__main__":
    main()

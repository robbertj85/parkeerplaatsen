#!/usr/bin/env python3
"""
Fetch parking garage data from RDW Open Data (opendata.rdw.nl) via Socrata API.

Datasets used:
- adw6-9hsg: Parking areas (GEBIED) - basic area info
- ygq4-hh5q: Parking addresses - street, city, province
- b3us-f26s: Specifications - capacity, EV charging, disabled spots, max height
- 534e-5vdg: Tariff parts - pricing information
- nsk3-v9n7: Geo area with coordinates (GEOMETRIE GEBIED)
- figd-gux7: Opening hours - 24h access, open all year
- 2uc2-nnv3: Area managers - municipality names, websites
- mz4f-59fw: PARKEERGEBIED - links NPR areas to SPDP 2.0, includes UUID
- ixf8-gtwq: TIJDVAK - time-based parking regulations (when paid parking applies)
- f6v7-gjpa: Index Statisch en Dynamisch - master index of real-time data sources
- j96a-7nhx: BETAALMETHODE VERKOOPPUNT - payment methods at parking facilities
"""

import json
import requests
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from collections import defaultdict

# RDW Open Data Socrata API
RDW_BASE = "https://opendata.rdw.nl/resource"

# Key datasets
DATASETS = {
    "parking_areas": "adw6-9hsg",       # Parking areas (GEBIED)
    "parking_address": "ygq4-hh5q",     # Parking addresses
    "parking_specs": "b3us-f26s",       # Specifications (capacity, EV, disabled, height)
    "tariff_parts": "534e-5vdg",        # Tariff parts
    "geo_area": "nsk3-v9n7",            # Geo area with coordinates (GEOMETRIE GEBIED)
    "opening_hours": "figd-gux7",       # Opening hours info
    "area_managers": "2uc2-nnv3",       # Municipality/operator names
    # New datasets
    "parkeergebied": "mz4f-59fw",       # PARKEERGEBIED - NPR/SPDP 2.0 link with UUID
    "tijdvak": "ixf8-gtwq",             # TIJDVAK - time-based parking regulations
    "regeling_gebied": "qtex-qwd8",     # REGELING GEBIED - links areas to regulations
    "realtime_index": "f6v7-gjpa",      # Index Statisch en Dynamisch - real-time sources
    "payment_methods": "j96a-7nhx",     # BETAALMETHODE VERKOOPPUNT - payment methods
}


def fetch_socrata(dataset_id: str, params: Optional[dict] = None, paginate: bool = False) -> list:
    """Fetch data from RDW Socrata API.

    Args:
        dataset_id: The Socrata dataset ID
        params: Optional query parameters
        paginate: If True, fetch all records using pagination (for large datasets)
    """
    url = f"{RDW_BASE}/{dataset_id}.json"

    default_params = {"$limit": 50000}
    if params:
        default_params.update(params)

    print(f"Fetching dataset {dataset_id}...")

    try:
        if paginate:
            all_data = []
            offset = 0
            limit = 50000
            while True:
                page_params = {**default_params, "$limit": limit, "$offset": offset}
                response = requests.get(url, params=page_params, timeout=120)
                response.raise_for_status()
                data = response.json()
                if not data:
                    break
                all_data.extend(data)
                print(f"  Fetched {len(all_data)} records so far...")
                if len(data) < limit:
                    break
                offset += limit
            print(f"  Total: {len(all_data)} records")
            return all_data
        else:
            response = requests.get(url, params=default_params, timeout=60)
            response.raise_for_status()
            data = response.json()
            print(f"  Found {len(data)} records")
            return data
    except requests.exceptions.RequestException as e:
        print(f"  Error: {e}")
        return []


def format_time(hhmm: str) -> str:
    """Format HHMM time string to HH:MM."""
    if not hhmm:
        return hhmm
    # Pad to 4 digits
    hhmm = hhmm.zfill(4)
    # Handle special case of 2400 -> 24:00
    if hhmm == "2400":
        return "24:00"
    return f"{hhmm[:2]}:{hhmm[2:4]}"


def parse_day_timeframe(day_code: str) -> str:
    """Parse day timeframe code to human-readable format."""
    day_mapping = {
        # Numeric codes
        "1": "Monday",
        "2": "Tuesday",
        "3": "Wednesday",
        "4": "Thursday",
        "5": "Friday",
        "6": "Saturday",
        "7": "Sunday",
        "8": "Public holidays",
        "9": "Day before public holiday",
        "a": "Shopping Sundays",
        "b": "All days",
        # Dutch day names (as returned by RDW API)
        "MAANDAG": "Monday",
        "DINSDAG": "Tuesday",
        "WOENSDAG": "Wednesday",
        "DONDERDAG": "Thursday",
        "VRIJDAG": "Friday",
        "ZATERDAG": "Saturday",
        "ZONDAG": "Sunday",
        "FEESTDAG": "Public holidays",
        "DAGVOORFEESTDAG": "Day before public holiday",
        "KOOPZONDAG": "Shopping Sundays",
        "ALLEDAG": "All days",
    }
    return day_mapping.get(day_code.upper() if day_code else "", day_code)


def parse_wkt_point(wkt: str) -> tuple:
    """Parse WKT POINT format to (lon, lat)."""
    if not wkt or not wkt.startswith("POINT"):
        return None, None
    try:
        # POINT (lon lat)
        coords = wkt.replace("POINT (", "").replace(")", "").strip()
        lon, lat = coords.split()
        return float(lon), float(lat)
    except:
        return None, None


def main():
    output_dir = Path(__file__).parent.parent / "data"
    output_dir.mkdir(exist_ok=True)

    # Fetch parking areas
    areas = fetch_socrata(DATASETS["parking_areas"])

    # Fetch area managers (municipality names and websites)
    managers = fetch_socrata(DATASETS["area_managers"])
    manager_lookup = {}
    for m in managers:
        mid = m.get("areamanagerid")
        if mid:
            manager_lookup[mid] = {
                "name": m.get("areamanagerdesc", ""),
                "website": m.get("url", ""),
            }
    print(f"  Built manager lookup with {len(manager_lookup)} entries")

    # Fetch addresses - keyed by area reference
    addresses = fetch_socrata(DATASETS["parking_address"])
    addr_lookup = {}
    for a in addresses:
        ref = a.get("parkingaddressreference")
        ref_type = a.get("parkingaddressreferencetype")
        addr_type = a.get("parkingaddresstype")
        if ref and addr_type == "A":  # "A" is the actual address, "P" is postal
            key = f"{ref_type}_{ref}" if ref_type else ref
            addr_lookup[key] = a
            # Also store by just the reference
            addr_lookup[ref] = a
    print(f"  Built address lookup with {len(addr_lookup)} entries")

    # Fetch geo data (with coordinates in WKT format)
    geo_data = fetch_socrata(DATASETS["geo_area"])
    geo_lookup = {}
    for g in geo_data:
        area_id = g.get("areaid")
        if area_id:
            geo_lookup[area_id] = g
            # Also try with areamanagerid prefix
            manager_id = g.get("areamanagerid")
            if manager_id:
                geo_lookup[f"{manager_id}_{area_id}"] = g

    # Fetch specs (capacity, EV charging, disabled spots, max height)
    specs = fetch_socrata(DATASETS["parking_specs"])
    specs_lookup = {}
    for s in specs:
        area_id = s.get("areaid")
        if area_id:
            # Store the most recent spec (higher startdatespecifications)
            if area_id not in specs_lookup:
                specs_lookup[area_id] = s
            else:
                # Keep the one with latest start date
                current_date = specs_lookup[area_id].get("startdatespecifications", "0")
                new_date = s.get("startdatespecifications", "0")
                if new_date > current_date:
                    specs_lookup[area_id] = s
    print(f"  Built specs lookup with {len(specs_lookup)} entries")

    # Fetch opening hours
    opening_hours = fetch_socrata(DATASETS["opening_hours"])
    hours_lookup = {}
    for h in opening_hours:
        area_id = h.get("areaid")
        if area_id:
            hours_lookup[area_id] = h
    print(f"  Built opening hours lookup with {len(hours_lookup)} entries")

    # ===== NEW DATASETS =====

    # Fetch PARKEERGEBIED (mz4f-59fw) - NPR/SPDP 2.0 link with UUID
    parkeergebied = fetch_socrata(DATASETS["parkeergebied"])
    parkeergebied_lookup = {}
    for p in parkeergebied:
        area_id = p.get("areaid")
        manager_id = p.get("areamanagerid")
        if area_id and manager_id:
            key = f"{manager_id}_{area_id}"
            parkeergebied_lookup[key] = p
            parkeergebied_lookup[area_id] = p
    print(f"  Built parkeergebied lookup with {len(parkeergebied_lookup)} entries")

    # Fetch REGELING GEBIED (qtex-qwd8) - links areas to regulations
    regeling_gebied = fetch_socrata(DATASETS["regeling_gebied"], paginate=True)
    # Build regulation_id -> area_id mapping
    regulation_to_area = defaultdict(set)
    for rg in regeling_gebied:
        reg_id = rg.get("regulationid")
        area_id = rg.get("areaid")
        manager_id = rg.get("areamanagerid")
        if reg_id and area_id:
            # Store mapping from regulationid to areaid
            regulation_to_area[reg_id].add(area_id)
            # Also store with manager prefix
            if manager_id:
                regulation_to_area[f"{manager_id}_{reg_id}"].add(f"{manager_id}_{area_id}")
    print(f"  Built regulation->area mapping with {len(regulation_to_area)} entries")

    # Fetch TIJDVAK (ixf8-gtwq) - time-based parking regulations (large dataset, use pagination)
    tijdvak_data = fetch_socrata(DATASETS["tijdvak"], paginate=True)
    # Group by area_id using the regulation->area mapping
    tijdvak_lookup = defaultdict(list)
    tijdvak_by_regulation = defaultdict(list)

    # First group by regulationid
    for t in tijdvak_data:
        reg_id = t.get("regulationid")
        if reg_id:
            tijdvak_by_regulation[reg_id].append(t)

    # Then map to area_ids
    for reg_id, tijdvak_records in tijdvak_by_regulation.items():
        # Find area_ids linked to this regulation
        area_ids = regulation_to_area.get(reg_id, set())
        for area_id in area_ids:
            tijdvak_lookup[area_id].extend(tijdvak_records)

    print(f"  Built tijdvak lookup with {len(tijdvak_lookup)} area entries")

    # Fetch Index Statisch en Dynamisch (f6v7-gjpa) - real-time data sources
    realtime_index = fetch_socrata(DATASETS["realtime_index"])
    realtime_lookup = {}
    for r in realtime_index:
        org_name = r.get("organization", "").lower()
        org_id = r.get("organizationid")
        if org_name:
            realtime_lookup[org_name] = {
                "has_static": r.get("staticparkingdata") == True or r.get("static_parking_data") == True,
                "static_url": r.get("urlstaticparkingdata") or r.get("url_static_parking_data"),
                "has_dynamic": r.get("dynamicparkingdata") == True or r.get("dynamic_parking_data") == True,
                "dynamic_url": r.get("urldynamicparkingdata") or r.get("url_dynamic_parking_data"),
                "standard": r.get("standardstaticparkingdata") or r.get("standard_static_parking_data"),
            }
        if org_id:
            realtime_lookup[str(org_id)] = realtime_lookup.get(org_name, {})
    print(f"  Built realtime index lookup with {len(realtime_lookup)} entries")

    # Fetch BETAALMETHODE VERKOOPPUNT (j96a-7nhx) - payment methods
    payment_methods = fetch_socrata(DATASETS["payment_methods"])
    payment_lookup = defaultdict(set)
    for pm in payment_methods:
        selling_point = pm.get("sellingpointnumber")
        method = pm.get("paymentmethod")
        if selling_point and method:
            payment_lookup[selling_point].add(method)
    print(f"  Built payment methods lookup with {len(payment_lookup)} entries")

    all_facilities = []

    for area in areas:
        area_id = area.get("areaid", "")
        manager_id = area.get("areamanagerid", "")
        if not area_id:
            continue

        # Try to find geo data with various ID formats
        geo = (geo_lookup.get(area_id) or
               geo_lookup.get(f"{manager_id}_{area_id}") or
               geo_lookup.get(f"{manager_id}_{area.get('areadesc', '').replace(' ', '_')}") or
               {})

        # Parse WKT POINT from areageometryastext
        wkt = geo.get("areageometryastext", "")
        lon, lat = parse_wkt_point(wkt)

        if not lat or not lon:
            continue

        # Get manager info (municipality name, website)
        manager_info = manager_lookup.get(manager_id, {})
        municipality_name = manager_info.get("name", "")
        website = manager_info.get("website", "")
        if website and not website.startswith("http"):
            website = f"https://{website}"

        # Get address - try multiple keys
        addr = (addr_lookup.get(f"GEBIED_{area_id}") or
                addr_lookup.get(area_id) or
                addr_lookup.get(manager_id) or
                {})

        # Build full address string
        street = addr.get("streetname", "")
        house_nr = addr.get("housenumber", "")
        zipcode = addr.get("zipcode", "")
        city = addr.get("place", "") or municipality_name
        province = addr.get("province", "")

        address_parts = []
        if street:
            if house_nr:
                address_parts.append(f"{street} {house_nr}")
            else:
                address_parts.append(street)
        if zipcode and city:
            address_parts.append(f"{zipcode} {city}")
        elif city:
            address_parts.append(city)

        full_address = ", ".join(address_parts)

        # Get specs (capacity, EV charging, disabled spots, max height)
        spec = specs_lookup.get(area_id, {})

        capacity = None
        capacity_total = spec.get("capacity")
        if capacity_total:
            try:
                capacity = {
                    "total": int(capacity_total),
                    "ev_charging": int(spec.get("chargingpointcapacity", 0) or 0),
                    "disabled": int(spec.get("disabledaccess", 0) or 0),
                }
            except (ValueError, TypeError):
                pass

        # Get max vehicle height
        max_height = None
        height_val = spec.get("maximumvehicleheight")
        if height_val:
            try:
                height_cm = int(height_val)
                if height_cm > 0:
                    max_height = height_cm  # in cm
            except (ValueError, TypeError):
                pass

        # Get opening hours info
        hours_info = hours_lookup.get(area_id, {})
        open_24h = hours_info.get("exitpossibleallday") == "1"
        open_all_year = hours_info.get("openallyear") == "1"

        # Build opening hours string
        opening_hours_str = None
        if open_24h and open_all_year:
            opening_hours_str = "24/7"
        elif open_24h:
            opening_hours_str = "24h"
        elif open_all_year:
            opening_hours_str = "Open all year"

        # ===== NEW: Get PARKEERGEBIED data (UUID, usage) =====
        composite_key = f"{manager_id}_{area_id}"
        parkeergebied_info = parkeergebied_lookup.get(composite_key) or parkeergebied_lookup.get(area_id) or {}
        uuid = parkeergebied_info.get("uuid")
        usage_id = parkeergebied_info.get("usageid")

        # ===== NEW: Get TIJDVAK time regulations =====
        tijdvak_records = tijdvak_lookup.get(composite_key) or tijdvak_lookup.get(area_id) or []
        time_regulations = []
        max_duration = None

        if tijdvak_records:
            # Process time regulations - group by day and build readable schedule
            day_schedules = defaultdict(set)  # Use set to avoid duplicates
            for tv in tijdvak_records:
                day = tv.get("daytimeframe", "")
                start_time = tv.get("starttimetimeframe", "")
                end_time = tv.get("endtimetimeframe", "")
                can_park = tv.get("claimrightpossible", "J") == "J"
                max_dur = tv.get("maxdurationright")

                # Get max duration (skip 0 values)
                if max_dur and max_duration is None:
                    try:
                        dur = int(max_dur)
                        if dur > 0:
                            max_duration = dur
                    except (ValueError, TypeError):
                        pass

                if day and start_time and end_time and can_park:
                    day_name = parse_day_timeframe(day)
                    time_range = f"{format_time(start_time)}-{format_time(end_time)}"
                    day_schedules[day_name].add(time_range)

            # Convert to list format with sorted times
            for day_name, times in day_schedules.items():
                if times:
                    time_regulations.append({
                        "day": day_name,
                        "hours": sorted(list(times)),
                    })

        # ===== NEW: Check real-time data availability =====
        municipality_lower = municipality_name.lower() if municipality_name else ""
        realtime_info = realtime_lookup.get(municipality_lower, {})
        has_realtime = realtime_info.get("has_dynamic", False)
        realtime_url = realtime_info.get("dynamic_url")

        # ===== NEW: Get payment methods (if available for this area) =====
        # Payment methods are linked to selling points, not directly to areas
        # We'll store any payment methods found
        payment_methods_list = list(payment_lookup.get(area_id, set()))

        # Determine type
        area_desc = area.get("areadesc", "").lower()
        parking_type = "garage"  # Default

        if "p+r" in area_desc or "park & ride" in area_desc or "park and ride" in area_desc:
            parking_type = "p_and_r"
        elif "carpool" in area_desc or "carpoolplaats" in area_desc:
            parking_type = "surface"  # Carpool spots are surface lots
        elif "terrein" in area_desc or "terrain" in area_desc:
            parking_type = "surface"
        elif "straat" in area_desc:
            parking_type = "street_paid"

        facility = {
            "id": f"rdw_{area_id}",
            "rdw_id": area_id,
            "uuid": uuid,  # NEW: SPDP 2.0 UUID for cross-referencing
            "source": "rdw",
            "name": area.get("areadesc", ""),
            "type": parking_type,
            "usage_type": usage_id,  # NEW: Usage type from PARKEERGEBIED
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "latitude": lat,
            "longitude": lon,
            "municipality": city or municipality_name,
            "province": province,
            "address": full_address,
            "capacity": capacity,
            "max_height": max_height,
            "is_paid": True,
            "operator": municipality_name or manager_id,
            "website": website if website else None,
            "opening_hours": opening_hours_str,
            # NEW: Time-based regulations from TIJDVAK
            "time_regulations": time_regulations if time_regulations else None,
            "max_duration_minutes": max_duration,  # NEW: Maximum parking duration
            # NEW: Real-time data availability
            "has_realtime": has_realtime,
            "realtime_url": realtime_url if has_realtime else None,
            # NEW: Payment methods
            "payment_methods": payment_methods_list if payment_methods_list else None,
            "last_updated": datetime.now(timezone.utc).isoformat()
        }

        all_facilities.append(facility)

    # Generate statistics
    stats = {
        "total": len(all_facilities),
        "by_type": {},
        "with_capacity": 0,
        "with_address": 0,
        "with_ev_charging": 0,
        "with_disabled_spots": 0,
        "with_max_height": 0,
        "with_opening_hours": 0,
        "total_capacity": 0,
        "total_ev_spots": 0,
        "total_disabled_spots": 0,
        # NEW statistics
        "with_uuid": 0,
        "with_time_regulations": 0,
        "with_max_duration": 0,
        "with_realtime": 0,
        "with_payment_methods": 0,
    }

    for f in all_facilities:
        ptype = f["type"]
        stats["by_type"][ptype] = stats["by_type"].get(ptype, 0) + 1
        if f.get("capacity"):
            stats["with_capacity"] += 1
            stats["total_capacity"] += f["capacity"].get("total", 0)
            if f["capacity"].get("ev_charging", 0) > 0:
                stats["with_ev_charging"] += 1
                stats["total_ev_spots"] += f["capacity"]["ev_charging"]
            if f["capacity"].get("disabled", 0) > 0:
                stats["with_disabled_spots"] += 1
                stats["total_disabled_spots"] += f["capacity"]["disabled"]
        if f.get("address"):
            stats["with_address"] += 1
        if f.get("max_height"):
            stats["with_max_height"] += 1
        if f.get("opening_hours"):
            stats["with_opening_hours"] += 1
        # NEW statistics
        if f.get("uuid"):
            stats["with_uuid"] += 1
        if f.get("time_regulations"):
            stats["with_time_regulations"] += 1
        if f.get("max_duration_minutes"):
            stats["with_max_duration"] += 1
        if f.get("has_realtime"):
            stats["with_realtime"] += 1
        if f.get("payment_methods"):
            stats["with_payment_methods"] += 1

    print(f"\n=== RDW Parking Data Summary ===")
    print(f"Total facilities: {stats['total']}")
    print(f"By type:")
    for ptype, count in sorted(stats["by_type"].items(), key=lambda x: -x[1]):
        print(f"  {ptype}: {count}")
    print(f"With capacity data: {stats['with_capacity']} (total: {stats['total_capacity']} spots)")
    print(f"With address: {stats['with_address']}")
    print(f"With EV charging: {stats['with_ev_charging']} (total: {stats['total_ev_spots']} spots)")
    print(f"With disabled spots: {stats['with_disabled_spots']} (total: {stats['total_disabled_spots']} spots)")
    print(f"With max height: {stats['with_max_height']}")
    print(f"With opening hours: {stats['with_opening_hours']}")
    # NEW statistics output
    print(f"\n=== New Data Fields ===")
    print(f"With UUID (SPDP 2.0): {stats['with_uuid']}")
    print(f"With time regulations: {stats['with_time_regulations']}")
    print(f"With max duration limit: {stats['with_max_duration']}")
    print(f"With real-time data: {stats['with_realtime']}")
    print(f"With payment methods: {stats['with_payment_methods']}")

    # Save data
    output_file = output_dir / "rdw_parking_nl.json"
    output = {
        "metadata": {
            "source": "RDW Open Data (Socrata)",
            "country": "Netherlands",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "stats": stats
        },
        "features": all_facilities
    }

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\nData saved to {output_file}")

    # GeoJSON
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
        ]
    }

    geojson_file = output_dir / "rdw_parking_nl.geojson"
    with open(geojson_file, "w", encoding="utf-8") as f:
        json.dump(geojson_output, f, ensure_ascii=False)

    print(f"GeoJSON saved to {geojson_file}")

    # Save real-time index separately for easy access
    realtime_index_output = {
        "metadata": {
            "source": "RDW Open Data - Index Statisch en Dynamisch (f6v7-gjpa)",
            "description": "Master index of municipalities/organizations with parking data APIs",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        },
        "organizations": []
    }

    for r in realtime_index:
        org_entry = {
            "name": r.get("organization"),
            "organization_id": r.get("organizationid"),
            "has_static_data": r.get("staticparkingdata") == True or r.get("static_parking_data") == True,
            "static_data_url": r.get("urlstaticparkingdata") or r.get("url_static_parking_data"),
            "static_data_standard": r.get("standardstaticparkingdata") or r.get("standard_static_parking_data"),
            "has_dynamic_data": r.get("dynamicparkingdata") == True or r.get("dynamic_parking_data") == True,
            "dynamic_data_url": r.get("urldynamicparkingdata") or r.get("url_dynamic_parking_data"),
        }
        realtime_index_output["organizations"].append(org_entry)

    realtime_file = output_dir / "rdw_realtime_index.json"
    with open(realtime_file, "w", encoding="utf-8") as f:
        json.dump(realtime_index_output, f, ensure_ascii=False, indent=2)

    # Count organizations with dynamic data
    orgs_with_dynamic = sum(1 for o in realtime_index_output["organizations"] if o["has_dynamic_data"])
    print(f"\nReal-time index saved to {realtime_file}")
    print(f"  Organizations with real-time data: {orgs_with_dynamic}")

    return stats


if __name__ == "__main__":
    main()

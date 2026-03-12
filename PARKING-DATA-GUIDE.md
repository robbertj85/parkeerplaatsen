# Dutch Parking Data Guide - Fetching Real-Time Occupancy

This guide describes how to fetch public parking data from Dutch national sources (NPR/RDW) to determine parking garage/facility occupancy. No API keys required for public facilities.

---

## Data Sources Overview

There are **two main RDW data sources** for parking in the Netherlands:

| Source | Type | URL | Auth Required |
|--------|------|-----|---------------|
| RDW SPDP v2 (NPR Open Data) | Real-time occupancy | `https://npropendata.rdw.nl/parkingdata/v2` | No (public) / Yes (limited) |
| RDW Open Data (Socrata) | Static facility info | `https://opendata.rdw.nl/resource/{dataset}.json` | No |

### Additional sources (may require keys)

| Source | Type | URL | Auth Required |
|--------|------|-----|---------------|
| NDW Open Data | Traffic & parking feeds | `https://opendata.ndw.nu/` | Yes (free registration) |
| Open Parking NL | Aggregated parking data | `https://api.openparking.nl/v1` | Yes |
| Q-Park API | Operator-specific data | Partnership access only | Yes |

---

## 1. RDW SPDP v2 API (Primary - Real-Time Occupancy)

This is the **main source for real-time parking occupancy** in the Netherlands. It follows the SPDP (Service for Parking Dynamic Data Platform) v2 standard.

Base URL: `https://npropendata.rdw.nl/parkingdata/v2`

### Step 1: Fetch the Index (all facilities nationwide)

```
GET https://npropendata.rdw.nl/parkingdata/v2
Accept: application/json
```

**Response** (~2MB+, contains ALL Dutch parking facilities):

```json
{
  "ParkingFacilities": [
    {
      "name": "Q-Park Beekstraat (Apeldoorn)",
      "identifier": "cea4cffe-158c-4b08-b940-5d5eefeba089",
      "staticDataUrl": "https://npropendata.rdw.nl/parkingdata/v2/static/cea4cffe-...",
      "dynamicDataUrl": "https://npropendata.rdw.nl/parkingdata/v2/dynamic/cea4cffe-...",
      "limitedAccess": false,
      "staticDataLastUpdated": 1733973747
    }
  ]
}
```

**Key fields per facility:**
- `identifier` - UUID, used to fetch static and dynamic data
- `limitedAccess` - `false` = publicly accessible, `true` = requires authentication
- `dynamicDataUrl` - if present, real-time data is available
- `staticDataUrl` - link to static facility info

**Filtering by city:** Filter the index client-side by checking if `name` contains your city name (e.g., `"Apeldoorn"`).

### Step 2: Fetch Static Data (facility details)

```
GET https://npropendata.rdw.nl/parkingdata/v2/static/{uuid}
Accept: application/json
```

**Response:**

```json
{
  "parkingFacilityInformation": {
    "identifier": "cea4cffe-158c-4b08-b940-5d5eefeba089",
    "name": "Q-Park Beekstraat",
    "description": "...",
    "locationForDisplay": {
      "latitude": 52.2095,
      "longitude": 5.9678
    },
    "operator": {
      "name": "Q-Park"
    },
    "specifications": [
      {
        "capacity": 350,
        "minimumHeightInMeters": 1.9
      }
    ],
    "openingTimes": { ... },
    "tariffs": { ... }
  }
}
```

**Available static data:**
- Name, description
- GPS coordinates (`locationForDisplay`)
- Operator name
- Capacity (number of spaces)
- Minimum vehicle height
- Opening times
- Tariff/pricing information

**Cache recommendation:** 24 hours (this data rarely changes).

### Step 3: Fetch Dynamic Data (real-time occupancy)

```
GET https://npropendata.rdw.nl/parkingdata/v2/dynamic/{uuid}
Accept: application/json
```

**Response:**

```json
{
  "parkingFacilityDynamicInformation": {
    "identifier": "cea4cffe-158c-4b08-b940-5d5eefeba089",
    "name": "Q-Park Beekstraat",
    "facilityActualStatus": {
      "lastUpdated": 1737301549,
      "open": true,
      "full": false,
      "parkingCapacity": 350,
      "vacantSpaces": 35,
      "statusDescription": "Open"
    }
  }
}
```

**Key fields for occupancy calculation:**
- `parkingCapacity` - total number of parking spaces
- `vacantSpaces` - currently available spaces
- `open` - boolean, whether the facility is open
- `full` - boolean, whether the facility is full
- `lastUpdated` - Unix timestamp (seconds) of last data update

**Occupancy calculation:**
```
occupied = parkingCapacity - vacantSpaces
occupancyPercent = (occupied / parkingCapacity) * 100
```

**Cache recommendation:** 30 seconds (data updates frequently).

### Important Notes on SPDP v2

- **Limited access facilities** (`limitedAccess: true`) return HTTP 401 - you need to contact RDW for authentication credentials
- Not all facilities have `dynamicDataUrl` - some only have static data (no real-time occupancy)
- The index response is large (>2MB) - cache it for at least 1 hour
- Use a `User-Agent` header identifying your application
- Stagger parallel requests (e.g., 50ms delay between calls) to avoid overwhelming the API

---

## 2. RDW Open Data (Socrata) - Static Facility Information

These datasets provide additional static information about parking facilities. Useful for enriching SPDP data with addresses, tariffs, and geo-coordinates.

Base URL: `https://opendata.rdw.nl/resource`

### Available Datasets

| Dataset | ID | Description |
|---------|----|-------------|
| GEO Parkeer Garages | `t5pc-eb34` | Geographic locations of parking garages |
| PARKEERADRES | `ygq4-hh5q` | Parking facility addresses |
| SPECIFICATIES PARKEERGEBIED | `nsk3-v9n7` | Parking area specifications |
| TARIEFDEEL | `b3us-f26s` | Tariff information |

### Fetching GEO Garage Data

```
GET https://opendata.rdw.nl/resource/t5pc-eb34.json?$limit=1000
```

**Response:**

```json
[
  {
    "areamanagerid": "200",
    "areaid": "200_MUSE",
    "areadesc": "Garage Museum Centrum",
    "location": {
      "latitude": "52.2154579",
      "longitude": "5.9565368"
    },
    "startdataarea": "20100101",
    "enddataarea": "29991231",
    "usageid": "PARKRIDE"
  }
]
```

**Filtering by city:** Use `areamanagerid` (e.g., `200` for Apeldoorn) or filter `areadesc` by city name.

### Fetching Addresses

```
GET https://opendata.rdw.nl/resource/ygq4-hh5q.json?place=Apeldoorn&$limit=100
```

**Response:**

```json
[
  {
    "parkingaddressreferencetype": "...",
    "parkingaddressreference": "23384",
    "streetname": "Beekstraat",
    "housenumber": "...",
    "zipcode": "7311LE",
    "place": "Apeldoorn",
    "telephonenumber": "...",
    "emailaddress": "..."
  }
]
```

### Socrata Query Features

RDW Open Data uses the Socrata API (SoSQL):
- Filter: `?place=Apeldoorn`
- Limit: `?$limit=100`
- Offset: `?$offset=200`
- Search: `?$where=areadesc like '%Apeldoorn%'`
- Full docs: https://dev.socrata.com/docs/queries/

---

## 3. Combining Data Sources

The recommended approach for a complete parking occupancy app:

### Data Flow

```
1. RDW SPDP v2 Index  -->  Get all facility UUIDs for your city
          |
          v
2. Static Data (SPDP v2 + RDW Open Data)  -->  Name, location, capacity, tariffs, addresses
          |
          v
3. Dynamic Data (SPDP v2)  -->  Real-time vacantSpaces, open/full status
          |
          v
4. Your App  -->  Calculate & display occupancy
```

### Mapping Between Sources

The SPDP v2 `identifier` (UUID) and RDW Open Data `areaid` are different identifiers. You need to manually map them (by matching on name/location) or maintain a lookup table. Example:

```json
{
  "QPARK_23384": {
    "rdwAreaId": "200_BEEK",
    "spdpUuid": "cea4cffe-158c-4b08-b940-5d5eefeba089",
    "name": "Q-Park Beekstraat"
  }
}
```

### Caching Strategy

| Data | TTL | Rationale |
|------|-----|-----------|
| SPDP Index | 1 hour | Facilities rarely added/removed |
| Static data | 24 hours | Capacity, location, tariffs change infrequently |
| Dynamic data | 30 seconds | Occupancy changes constantly |
| RDW Open Data | 24 hours | Static reference data |

---

## 4. Quick Start Example (TypeScript/fetch)

```typescript
const SPDP_BASE = 'https://npropendata.rdw.nl/parkingdata/v2';

// Step 1: Get all facilities for a city
async function getFacilitiesForCity(cityName: string) {
  const res = await fetch(SPDP_BASE, {
    headers: { 'Accept': 'application/json' }
  });
  const data = await res.json();
  return data.ParkingFacilities.filter(
    (f: any) => f.name?.toLowerCase().includes(cityName.toLowerCase())
  );
}

// Step 2: Get static info for a facility
async function getStaticInfo(uuid: string) {
  const res = await fetch(`${SPDP_BASE}/static/${uuid}`, {
    headers: { 'Accept': 'application/json' }
  });
  return (await res.json()).parkingFacilityInformation;
}

// Step 3: Get real-time occupancy
async function getOccupancy(uuid: string) {
  const res = await fetch(`${SPDP_BASE}/dynamic/${uuid}`, {
    headers: { 'Accept': 'application/json' }
  });
  const info = (await res.json()).parkingFacilityDynamicInformation;
  const status = info.facilityActualStatus;

  return {
    name: info.name,
    capacity: status.parkingCapacity,
    available: status.vacantSpaces,
    occupied: status.parkingCapacity - status.vacantSpaces,
    occupancyPercent: Math.round(
      ((status.parkingCapacity - status.vacantSpaces) / status.parkingCapacity) * 100
    ),
    isOpen: status.open,
    isFull: status.full,
    lastUpdated: new Date(status.lastUpdated * 1000),
  };
}

// Usage
const facilities = await getFacilitiesForCity('Apeldoorn');
const publicFacilities = facilities.filter((f: any) => !f.limitedAccess && f.dynamicDataUrl);

for (const facility of publicFacilities) {
  const occupancy = await getOccupancy(facility.identifier);
  console.log(`${occupancy.name}: ${occupancy.available}/${occupancy.capacity} available (${occupancy.occupancyPercent}% full)`);
}
```

---

## 5. Known Limitations

- **Not all garages report real-time data.** Many facilities only have static data in SPDP v2.
- **Limited access facilities** require separate authentication (contact RDW/NPR).
- **Capacity is not always in RDW Open Data.** The SPDP v2 dynamic endpoint often includes it via `parkingCapacity`, but RDW Socrata datasets may not have capacity fields.
- **Street parking zones** appear in SPDP v2 but typically don't have dynamic occupancy data.
- **Data quality varies** by operator - some update every few minutes, others less frequently. Check the `lastUpdated` timestamp.
- **The SPDP v2 index is large** (~2MB+). Always cache it.

---

## 6. Useful Links

- NPR Open Data portal: https://npropendata.rdw.nl/parkingdata/v2
- RDW Open Data (parking): https://opendata.rdw.nl/browse?category=Parkeren
- RDW GEO Parkeer Garages dataset: https://opendata.rdw.nl/Parkeren/GEO-Parkeer-Garages/t5pc-eb34
- NDW Open Data: https://opendata.ndw.nu/
- Open Parking NL: https://openparking.nl/

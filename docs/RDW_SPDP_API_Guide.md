# RDW SPDP v2 API - Real-time Parking Data Guide

## Overview

The RDW (Rijksdienst voor het Wegverkeer) provides real-time parking occupancy data through the **SPDP v2** (Standard for Publication of Dynamic Parking Data) API. This is the official Dutch national standard for parking data.

**Base URL:** `https://npropendata.rdw.nl/parkingdata/v2`

## Data Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Parking        │────▶│  RDW SPDP v2     │────▶│  Your           │
│  Operators      │     │  API             │     │  Application    │
│  (Q-Park, P1)   │     │                  │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## API Endpoints

### 1. Index Endpoint (List All Facilities)

```
GET https://npropendata.rdw.nl/parkingdata/v2
```

Returns a list of all registered parking facilities with their metadata.

**Response Structure:**
```json
{
  "ParkingFacilities": [
    {
      "name": "APELDOORN-Beekstraat",
      "identifier": "cea4cffe-158c-4b08-b940-5d5eefeba089",
      "staticDataUrl": "https://npropendata.rdw.nl/parkingdata/v2/static/{uuid}",
      "dynamicDataUrl": "https://npropendata.rdw.nl/parkingdata/v2/dynamic/{uuid}",
      "limitedAccess": false,
      "staticDataLastUpdated": 1733973747
    }
  ]
}
```

**Important Fields:**
| Field | Description |
|-------|-------------|
| `identifier` | UUID for the facility (use in other endpoints) |
| `dynamicDataUrl` | URL for real-time occupancy (only if available) |
| `limitedAccess` | `true` = requires authentication, `false` = publicly accessible |
| `staticDataUrl` | URL for static facility information |

### 2. Static Data Endpoint (Facility Details)

```
GET https://npropendata.rdw.nl/parkingdata/v2/static/{uuid}
```

Returns detailed information about a parking facility.

**Response Structure:**
```json
{
  "parkingFacilityInformation": {
    "identifier": "cea4cffe-158c-4b08-b940-5d5eefeba089",
    "name": "APELDOORN-Beekstraat",
    "description": "Q-Park Beekstraat",
    "locationForDisplay": {
      "latitude": 52.2133831,
      "longitude": 5.9621846
    },
    "operator": {
      "name": "Q-Park Nederland BV"
    },
    "specifications": [
      {
        "capacity": 110,
        "minimumHeightInMeters": 1.9
      }
    ],
    "openingTimes": { ... },
    "tariffs": { ... }
  }
}
```

### 3. Dynamic Data Endpoint (Real-time Occupancy) ⭐

```
GET https://npropendata.rdw.nl/parkingdata/v2/dynamic/{uuid}
```

Returns real-time occupancy data. **This is the key endpoint for live data.**

**Response Structure:**
```json
{
  "parkingFacilityDynamicInformation": {
    "identifier": "cea4cffe-158c-4b08-b940-5d5eefeba089",
    "name": "APELDOORN-Beekstraat",
    "description": "APELDOORN-Beekstraat",
    "facilityActualStatus": {
      "lastUpdated": 1768831598,
      "open": true,
      "full": false,
      "parkingCapacity": 110,
      "vacantSpaces": 55,
      "statusDescription": ""
    }
  }
}
```

**Key Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `lastUpdated` | Unix timestamp | When data was last updated |
| `open` | boolean | Is the facility currently open |
| `full` | boolean | Is the facility full |
| `parkingCapacity` | integer | Total parking spaces |
| `vacantSpaces` | integer | Currently available spaces |

**Calculated Values:**
```
occupied = parkingCapacity - vacantSpaces
occupancyPercent = (occupied / parkingCapacity) * 100
```

## Authentication

### Public Facilities (`limitedAccess: false`)
No authentication required. Simply make HTTP requests with standard headers:

```http
GET /parkingdata/v2/dynamic/{uuid} HTTP/1.1
Host: npropendata.rdw.nl
Accept: application/json
User-Agent: YourApp/1.0
```

### Limited Access Facilities (`limitedAccess: true`)
These facilities (many Q-Park garages) require authentication. Contact RDW for API access credentials.

## Implementation Example

### JavaScript/TypeScript

```typescript
interface OccupancyData {
  uuid: string;
  name: string;
  capacity: number;
  available: number;
  occupied: number;
  occupancyPercent: number;
  isOpen: boolean;
  isFull: boolean;
  lastUpdated: Date;
}

async function fetchOccupancy(uuid: string): Promise<OccupancyData | null> {
  const response = await fetch(
    `https://npropendata.rdw.nl/parkingdata/v2/dynamic/${uuid}`,
    {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'YourApp/1.0'
      }
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      console.error('Limited access facility - authentication required');
    }
    return null;
  }

  const data = await response.json();
  const info = data.parkingFacilityDynamicInformation;
  const status = info.facilityActualStatus;

  const capacity = status.parkingCapacity || 0;
  const available = status.vacantSpaces || 0;
  const occupied = capacity - available;

  return {
    uuid: info.identifier,
    name: info.name,
    capacity,
    available,
    occupied,
    occupancyPercent: capacity > 0 ? Math.round((occupied / capacity) * 100) : 0,
    isOpen: status.open,
    isFull: status.full,
    lastUpdated: new Date(status.lastUpdated * 1000),
  };
}
```

### Python

```python
import requests
from datetime import datetime
from dataclasses import dataclass

@dataclass
class OccupancyData:
    uuid: str
    name: str
    capacity: int
    available: int
    occupied: int
    occupancy_percent: int
    is_open: bool
    is_full: bool
    last_updated: datetime

def fetch_occupancy(uuid: str) -> OccupancyData | None:
    url = f"https://npropendata.rdw.nl/parkingdata/v2/dynamic/{uuid}"
    headers = {
        "Accept": "application/json",
        "User-Agent": "YourApp/1.0"
    }

    response = requests.get(url, headers=headers, timeout=15)

    if response.status_code == 401:
        print("Limited access facility - authentication required")
        return None

    response.raise_for_status()
    data = response.json()

    info = data["parkingFacilityDynamicInformation"]
    status = info["facilityActualStatus"]

    capacity = status.get("parkingCapacity", 0)
    available = status.get("vacantSpaces", 0)
    occupied = capacity - available

    return OccupancyData(
        uuid=info["identifier"],
        name=info["name"],
        capacity=capacity,
        available=available,
        occupied=occupied,
        occupancy_percent=round((occupied / capacity) * 100) if capacity > 0 else 0,
        is_open=status.get("open", False),
        is_full=status.get("full", False),
        last_updated=datetime.fromtimestamp(status["lastUpdated"])
    )
```

## Finding Facilities by City

To find parking facilities in a specific city:

```python
def find_facilities_by_city(city_name: str) -> list:
    url = "https://npropendata.rdw.nl/parkingdata/v2"
    response = requests.get(url, headers={"Accept": "application/json"})
    data = response.json()

    facilities = data.get("ParkingFacilities", [])

    # Filter by city name (case-insensitive)
    city_lower = city_name.lower()
    matching = [
        f for f in facilities
        if city_lower in f.get("name", "").lower()
    ]

    # Separate public vs limited access
    public = [f for f in matching if not f.get("limitedAccess", True)]
    limited = [f for f in matching if f.get("limitedAccess", True)]

    return {
        "public": public,      # Can fetch without auth
        "limited": limited,    # Requires authentication
        "total": len(matching)
    }
```

## Known Public Facilities (Apeldoorn Example)

| Name | UUID | Has Real-time |
|------|------|---------------|
| P+R Laan van de Mensenrechten | `d713179a-5257-46e3-a989-705291add0c1` | Yes |
| APELDOORN-Beekstraat | `cea4cffe-158c-4b08-b940-5d5eefeba089` | Yes |
| Carpool Agrifirm (A50) | `33ac0b4d-9a9d-4c39-85df-13293292f04b` | Yes |

## Data Freshness

- **Update Frequency:** Data is typically updated every 1-5 minutes by parking operators
- **`lastUpdated` Field:** Always check this timestamp to know data freshness
- **Recommended Polling:** 30-60 seconds for real-time displays

## Rate Limiting

The API does not have documented rate limits, but recommended practices:
- Cache responses for at least 30 seconds
- Don't poll more frequently than every 30 seconds per facility
- Batch requests where possible

## Error Handling

| Status Code | Meaning | Action |
|-------------|---------|--------|
| 200 | Success | Parse response |
| 401 | Unauthorized | Facility has `limitedAccess: true` |
| 404 | Not Found | Invalid UUID |
| 500 | Server Error | Retry with exponential backoff |

## CORS Considerations

The API does not support CORS. For browser-based applications, you need:
1. A backend proxy to make requests
2. Or use a serverless function (Next.js API route, Vercel Edge, etc.)

Example Next.js API route:
```typescript
// app/api/parking/[uuid]/route.ts
export async function GET(
  request: Request,
  { params }: { params: { uuid: string } }
) {
  const response = await fetch(
    `https://npropendata.rdw.nl/parkingdata/v2/dynamic/${params.uuid}`,
    { headers: { 'Accept': 'application/json' } }
  );

  const data = await response.json();
  return Response.json(data);
}
```

## Related Resources

- **RDW Open Data Portal:** https://opendata.rdw.nl
- **NPR (Nationaal Parkeer Register):** https://www.npr.nl
- **SPDP Standard Documentation:** Available via RDW

## Limitations

1. **Limited Access Facilities:** Many commercial garages (Q-Park, P1) have `limitedAccess: true`
2. **Coverage:** Not all parking facilities in the Netherlands participate
3. **Data Quality:** Depends on individual operators updating their systems
4. **No Historical Data:** API only provides current state, not historical trends

## Contact

For API access to limited facilities or technical questions:
- RDW: https://www.rdw.nl/contact

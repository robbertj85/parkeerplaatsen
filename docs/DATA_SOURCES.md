# Dutch Car Parking Data Sources

Comprehensive overview of open data sources for car parking in the Netherlands.

## Quick Reference

| Source | Data Type | Coverage | Real-time | API | Free |
|--------|-----------|----------|-----------|-----|------|
| RDW Open Data | Garages, P+R | National | Yes | REST/Socrata | Yes |
| NPR | Tariffs, zones | National | No | REST | Yes |
| OpenStreetMap | All parking | National | No | Overpass | Yes |
| Amsterdam | Individual spots | Amsterdam | Partial | WFS/REST | Yes* |
| Eindhoven | Parking lots | Eindhoven | No | REST | Yes |
| NDW | Traffic/parking | National | Yes | DATEX II | Yes |

*Amsterdam requires API key since Feb 2024

---

## 1. National Data Sources

### 1.1 RDW Open Data Portal

**URL**: https://opendata.rdw.nl/browse?category=Parkeren

The RDW (Rijksdienst voor het Wegverkeer) provides comprehensive parking data for the Netherlands.

#### Available Datasets

| Dataset ID | Name | Description | Records | Update Frequency |
|------------|------|-------------|---------|------------------|
| adw6-9hsg | Parking Areas (GEBIED) | Basic area info | ~2,500+ | Daily |
| ygq4-hh5q | PARKEERADRES | Address information | ~3,800 | Daily |
| b3us-f26s | SPECIFICATIES PARKEERGEBIED | Capacity, EV charging, disabled spots, max height | ~3,100 | Weekly |
| nsk3-v9n7 | GEOMETRIE GEBIED | WGS84 coordinates for parking areas | ~8,400 | Weekly |
| figd-gux7 | Opening Hours | 24h access, open all year | ~2,000+ | Weekly |
| 2uc2-nnv3 | Area Managers | Municipality names, websites | ~500+ | Weekly |
| 534e-5vdg | Tariff Parts | Pricing structure | ~5,000+ | Weekly |
| **mz4f-59fw** | **PARKEERGEBIED** | NPR/SPDP 2.0 link with UUID | ~14,200 | Weekly |
| **ixf8-gtwq** | **TIJDVAK** | Time-based parking regulations (paid hours, max stay) | ~90,000 | Weekly |
| **qtex-qwd8** | **REGELING GEBIED** | Links areas to regulations (needed for TIJDVAK) | ~21,500 | Weekly |
| **f6v7-gjpa** | **Index Statisch en Dynamisch** | Master index of real-time data sources per municipality | ~164 | Monthly |
| **j96a-7nhx** | **BETAALMETHODE VERKOOPPUNT** | Payment methods at parking terminals | ~186 | Weekly |

**Bold** = Newly integrated datasets

#### API Access

```bash
# Base URL
https://opendata.rdw.nl/resource/{dataset-id}.json

# Example: Get parking facilities
curl "https://opendata.rdw.nl/resource/t5pc-eb34.json"

# With filtering
curl "https://opendata.rdw.nl/resource/t5pc-eb34.json?\$where=gemeentenaam='AMSTERDAM'"

# Get time regulations (TIJDVAK)
curl "https://opendata.rdw.nl/resource/ixf8-gtwq.json?\$limit=1000"

# Get real-time data index
curl "https://opendata.rdw.nl/resource/f6v7-gjpa.json"
```

#### Key Endpoints

- **Static data**: https://npropendata.rdw.nl/parkingdata/v2
- **Dynamic data**: Via facility-specific URLs in index (f6v7-gjpa)
- **Documentation**: https://npropendata.rdw.nl/

#### New Data Fields (from integrated datasets)

| Field | Source Dataset | Description |
|-------|----------------|-------------|
| `uuid` | PARKEERGEBIED | SPDP 2.0 unique identifier for cross-referencing |
| `usage_type` | PARKEERGEBIED | Usage classification code |
| `time_regulations` | TIJDVAK | When paid parking applies (days, hours) |
| `max_duration_minutes` | TIJDVAK | Maximum parking duration allowed |
| `has_realtime` | Index | Whether facility has real-time occupancy data |
| `realtime_url` | Index | API endpoint for live availability |
| `payment_methods` | BETAALMETHODE | Accepted payment methods (Maestro, Visa, coins, etc.) |

#### Data Quality Notes
- Primarily covers commercial parking garages
- Q-Park has best coverage; P1 and others expanding
- Real-time data available for ~100+ garages (check Index dataset)
- Capacity data generally reliable
- TIJDVAK provides detailed time-based regulations for ~90,000 records

---

### 1.2 NPR (Nationaal Parkeerregister)

**URL**: https://nationaalparkeerregister.nl/

The national register for parking regulations, tariffs, and zones.

#### Available Data

- **Parking zones** (tariefgebieden)
- **Tariff structures** (progressive/degressive rates)
- **Operating hours**
- **Permit zones** (vergunninggebieden)
- **Parking regulations**

#### API Access

```bash
# Via RDW Open Data
https://opendata.rdw.nl/Parkeren/NPR-Regelingen-Amsterdam/b62t-p6rh
```

#### Data Format: SPDP 2.0

Standard for Publication of Dynamic Parking Data - subset of DATEX II.

```json
{
  "parkingAreaReference": "NL-P-12345",
  "parkingAreaName": "Centrum Garage",
  "parkingAreaTariff": {
    "tariffParts": [
      {
        "duration": "PT1H",
        "amount": 4.50,
        "currency": "EUR"
      }
    ]
  }
}
```

---

### 1.3 OpenStreetMap (via Overpass API)

**URL**: https://overpass-turbo.eu/

Community-maintained geographic data with extensive parking coverage.

#### Relevant Tags

| Tag | Description | Count (NL estimate) |
|-----|-------------|---------------------|
| `amenity=parking` | Parking areas | ~50,000+ |
| `amenity=parking_space` | Individual spots | ~10,000+ |
| `parking=surface` | Surface lots | ~30,000+ |
| `parking=multi-storey` | Parking garages | ~1,000+ |
| `parking=underground` | Underground parking | ~500+ |
| `parking=street_side` | Street-side parking | ~5,000+ |
| `parking=lane` | Lane parking | ~3,000+ |

#### Overpass Query Examples

```
// All parking in Netherlands
[out:json][timeout:300];
area["ISO3166-1"="NL"]->.nl;
(
  nwr["amenity"="parking"](area.nl);
);
out center;

// Parking garages only
[out:json][timeout:300];
area["ISO3166-1"="NL"]->.nl;
(
  nwr["amenity"="parking"]["parking"~"multi-storey|underground"](area.nl);
);
out center;

// Street parking
[out:json][timeout:300];
area["ISO3166-1"="NL"]->.nl;
(
  nwr["amenity"="parking"]["parking"~"street_side|lane"](area.nl);
);
out center;

// With capacity
[out:json][timeout:300];
area["ISO3166-1"="NL"]->.nl;
(
  nwr["amenity"="parking"]["capacity"](area.nl);
);
out center;
```

#### Additional OSM Attributes

- `capacity` - Number of spaces
- `capacity:disabled` - Disabled spaces
- `capacity:charging` - EV charging spots
- `fee` - yes/no
- `maxstay` - Maximum parking duration
- `operator` - Operating company
- `opening_hours` - Operating hours
- `surface` - Paved/unpaved
- `access` - Public/private/customers

---

### 1.4 NDW (Nationaal Dataportaal Wegverkeer)

**URL**: https://ndw.nu/ / https://ntm.ndw.nu/

National traffic data portal with parking components.

#### Available Data

- Real-time parking occupancy
- Historical traffic patterns
- Road network data

#### Access

- DATEX II format
- Requires registration for some datasets
- Publication page: https://ntm.ndw.nu/publicaties/

---

### 1.5 CBS (Statistics Netherlands)

**URL**: https://opendata.cbs.nl/

Statistical data at municipality/neighborhood level.

#### Relevant Datasets

- Vehicle registrations per municipality
- Household car ownership
- Urban density metrics
- Neighborhood statistics (can correlate with parking demand)

#### API Access (cbsodataR for R, or direct)

```bash
# StatLine OData API
https://opendata.cbs.nl/ODataApi/odata/85618NED/
```

---

## 2. Municipal Data Sources

### 2.1 Amsterdam

**Portal**: https://data.amsterdam.nl/

#### Parkeervakken (Individual Parking Spots)

The most detailed street parking dataset in the Netherlands.

**Datasets**:
- All parking spots (parkeervakken)
- Fiscal spots (paid parking)
- Disabled spots
- Loading zones
- EV charging spots

**API Endpoints**:

```bash
# WFS Service
https://api.data.amsterdam.nl/v1/wfs/parkeervakken/

# GeoJSON export
https://map.data.amsterdam.nl/maps/parkeervakken?REQUEST=Getfeature&VERSION=1.1.0&SERVICE=wfs&TYPENAME=alle_parkeervakken&outputformat=geojson

# API Documentation
https://api.data.amsterdam.nl/v1/docs/datasets/parkeervakken.html
```

**Note**: API key required since February 2024. Request at dataplatform@amsterdam.nl

**Data Fields**:
- `id` - Unique identifier
- `type` - FISCAAL, MULDER (disabled), etc.
- `soort` - Type (e.g., "algemeen", "laden/lossen")
- `aantal` - Number of spots in this area
- `geometry` - Polygon/point geometry
- `e_type` - Electric vehicle designation
- `regimes` - Time-based regulations

#### Parking Garages

```bash
# Real-time garage availability
https://api.data.amsterdam.nl/v1/parkeervakken/parkeergarages/
```

#### Parking Zones (Tariefgebieden)

Areas with different parking rates.

```bash
https://api.data.amsterdam.nl/v1/parkeervakken/tariefgebieden/
```

**GitHub**: https://github.com/Amsterdam/parkeervakken

---

### 2.2 Rotterdam

**Portal**: https://rotterdamopendata.nl/ (via data.overheid.nl)

#### Available Data
- Parking garages (via RDW)
- P+R locations
- Parking zones

Access primarily through RDW national datasets.

---

### 2.3 Den Haag

**Portal**: Via RDW/NPR

#### Available Data
- Parkeergebieden (parking areas)
- Vergunningsgebieden (permit zones)
- P+R Den Haag Centraal area

---

### 2.4 Utrecht

**Portal**: https://data.utrecht.nl/

#### Available Data
- Parking facilities (via RDW)
- P+R Westraven, P+R De Uithof, etc.
- Parking zones

---

### 2.5 Eindhoven

**Portal**: https://data.eindhoven.nl/

#### Parkeerplaatsen Dataset

**URL**: https://data.eindhoven.nl/explore/dataset/parkeerplaatsen/

Overview of publicly accessible parking spaces.

**API**:
```bash
# REST API
https://data.eindhoven.nl/api/explore/v2.1/catalog/datasets/parkeerplaatsen/records

# Export
https://data.eindhoven.nl/api/explore/v2.1/catalog/datasets/parkeerplaatsen/exports/geojson
```

---

## 3. P+R (Park & Ride) Data

### Sources

1. **RDW Open Data** - Official P+R locations with occupancy
2. **NS** - Integration with train travel (ns.nl/en/door-to-door/parking)
3. **Q-Park** - Operates 50+ P+R locations

### Coverage

~50+ P+R locations at train stations nationally.

### Data Available
- Location (coordinates)
- Capacity
- Real-time availability (for equipped facilities)
- Pricing (often €1/24h with train travel)
- Opening hours

---

## 4. Real-time Occupancy Data

### Sources with Live Data

| Provider | Coverage | Update Frequency |
|----------|----------|------------------|
| RDW/NPR | ~100+ garages | 1-5 minutes |
| Q-Park | Q-Park facilities | Real-time |
| P1 | P1 facilities | Real-time |
| Municipal | Varies | Varies |

### Data Format

```json
{
  "facilityId": "NL-P-AMS-001",
  "timestamp": "2024-01-15T14:30:00Z",
  "totalCapacity": 500,
  "availableSpaces": 127,
  "occupancyRate": 0.746,
  "trend": "filling"
}
```

---

## 5. Data Quality & Completeness

### Best Coverage

1. **Parking Garages**: Excellent (RDW + OSM)
2. **P+R Facilities**: Good (RDW + NS)
3. **Street Parking Amsterdam**: Excellent (municipal data)
4. **Street Parking Other Cities**: Poor to moderate

### Known Gaps

- Individual street parking spots outside Amsterdam
- Real-time occupancy for street parking
- Comprehensive tariff data for all municipalities
- Historical occupancy data

### Data Freshness

| Source | Update Frequency |
|--------|------------------|
| RDW Static | Daily to weekly |
| RDW Dynamic | Real-time (1-5 min) |
| OSM | Community-driven |
| Municipal | Varies (daily to monthly) |

---

## 6. Integration Strategy

### Recommended Approach

1. **Base layer**: OpenStreetMap for comprehensive parking locations
2. **Enrichment**: RDW/NPR for tariffs and official data
3. **Real-time**: RDW dynamic data for occupancy
4. **Detail**: Municipal APIs for individual spots (where available)
5. **Statistics**: CBS for city-level aggregations

### Data Merging

Use geographic proximity + name matching to merge:
- OSM `amenity=parking` with RDW facilities
- Match on coordinates (within ~50m)
- Validate with name similarity

---

## 7. API Keys & Registration

| Source | Registration Required | Cost |
|--------|----------------------|------|
| RDW Open Data | No | Free |
| NPR | No | Free |
| OpenStreetMap | No | Free |
| Amsterdam | Yes (API key) | Free |
| Eindhoven | No | Free |
| CBS | No | Free |
| NDW | Yes (some datasets) | Free |

---

## 8. Legal & Usage Notes

### Licenses

- **RDW**: Public Domain / CC0
- **OpenStreetMap**: ODbL (attribution required)
- **Amsterdam**: CC BY 4.0
- **CBS**: CC BY 4.0

### Attribution Requirements

When using OSM data:
```
© OpenStreetMap contributors
```

When using municipal data, check specific license terms.

---

## 9. Resources & Links

### Official Portals
- https://opendata.rdw.nl/
- https://npropendata.rdw.nl/
- https://data.overheid.nl/
- https://nationaalparkeerregister.nl/

### Technical Documentation
- SPDP 2.0: https://data.openparking.nl/downloads/Standard_for_the_Publication_of_Dynamic_Parking_Data_v2.0.pdf
- RDW API: https://opendata.rdw.nl/
- Overpass API: https://wiki.openstreetmap.org/wiki/Overpass_API

### Municipal Portals
- Amsterdam: https://data.amsterdam.nl/
- Eindhoven: https://data.eindhoven.nl/
- Utrecht: https://data.utrecht.nl/

### Tools
- Overpass Turbo: https://overpass-turbo.eu/
- QGIS: For visualizing/processing geodata
- osmium: For processing OSM extracts

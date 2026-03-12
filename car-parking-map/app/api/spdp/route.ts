import { NextResponse } from 'next/server';

const SPDP_BASE_URL = 'https://npropendata.rdw.nl/parkingdata/v2';

const HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (compatible; ParkingApp/1.0)',
};

// Public Apeldoorn facilities with real-time data (limitedAccess: false)
const PUBLIC_FACILITIES: Record<string, string> = {
  'd713179a-5257-46e3-a989-705291add0c1': 'P+R Laan van de Mensenrechten',
  'cea4cffe-158c-4b08-b940-5d5eefeba089': 'APELDOORN-Beekstraat',
  '33ac0b4d-9a9d-4c39-85df-13293292f04b': 'afrit 24 Apeldoorn (A50)',
};

export interface SPDPDynamicResponse {
  parkingFacilityDynamicInformation: {
    identifier: string;
    name: string;
    description: string;
    facilityActualStatus: {
      lastUpdated: number;
      open: boolean;
      full: boolean;
      parkingCapacity: number;
      vacantSpaces: number;
      statusDescription?: string;
      chargePointVacantSpaces?: number;
    };
  };
}

export interface OccupancyData {
  uuid: string;
  name: string;
  capacity: number;
  available: number;
  occupied: number;
  occupancyPercent: number;
  isOpen: boolean;
  isFull: boolean;
  lastUpdated: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const uuids = searchParams.get('uuids')?.split(',') || Object.keys(PUBLIC_FACILITIES);

  try {
    const results: OccupancyData[] = [];
    const errors: string[] = [];

    // Fetch data for each UUID in parallel
    const fetchPromises = uuids
      .filter(uuid => PUBLIC_FACILITIES[uuid]) // Only allow public facilities
      .map(async (uuid) => {
        try {
          const response = await fetch(
            `${SPDP_BASE_URL}/dynamic/${uuid}`,
            {
              headers: HEADERS,
              next: { revalidate: 30 } // Cache for 30 seconds
            }
          );

          if (!response.ok) {
            errors.push(`Failed to fetch ${uuid}: ${response.status}`);
            return null;
          }

          const data: SPDPDynamicResponse = await response.json();
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
            lastUpdated: new Date(status.lastUpdated * 1000).toISOString(),
          };
        } catch (error) {
          errors.push(`Error fetching ${uuid}: ${error}`);
          return null;
        }
      });

    const fetchResults = await Promise.all(fetchPromises);
    fetchResults.forEach(result => {
      if (result) results.push(result);
    });

    return NextResponse.json({
      occupancy: results,
      fetchedAt: new Date().toISOString(),
      errors: errors.length > 0 ? errors : undefined,
      availableFacilities: PUBLIC_FACILITIES,
    });
  } catch (error) {
    console.error('Error fetching SPDP data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch real-time parking data' },
      { status: 500 }
    );
  }
}

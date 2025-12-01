import { NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';

/**
 * EU Open Data Portal - Truck Parking API
 *
 * Fetches and parses truck parking data from the European Access Point for Truck Parking (ETPA)
 * Data format: DATEX II XML (Commission delegated Regulation EU No 885/2013)
 *
 * To add EU data sources:
 * 1. Visit https://data.europa.eu/data/datasets/etpa
 * 2. Download DATEX II XML files for desired countries
 * 3. Add URLs to the EU_DATA_SOURCES array below
 */

// EU Data Sources - Add more country data URLs here
// Repository: https://data.europa.eu/euodp/repository/ec/dg-move/etpa/
const EU_DATA_SOURCES = [
  {
    country: 'AT',
    name: 'Austria',
    url: 'https://data.europa.eu/euodp/repository/ec/dg-move/etpa/AT-ASFINAG.xml'
  },
  {
    country: 'DE',
    name: 'Germany (Schleswig-Holstein)',
    url: 'https://data.europa.eu/euodp/repository/ec/dg-move/etpa/DE-DE-SH-ITP.xml'
  },
  // Add more countries as they become available:
  // Netherlands - Not yet available in ETPA repository
  // { country: 'NL', name: 'Netherlands', url: 'https://data.europa.eu/euodp/repository/ec/dg-move/etpa/NL-*.xml' },
  // Belgium - Not yet available in ETPA repository
  // { country: 'BE', name: 'Belgium', url: 'https://data.europa.eu/euodp/repository/ec/dg-move/etpa/BE-*.xml' },
];

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: true,
});

interface EUParkingFacility {
  id: string;
  country: string;
  name: string;
  location: {
    latitude: number;
    longitude: number;
  };
  capacity?: {
    totalSpaces?: number;
    hgvSpaces?: number;
  };
  security?: {
    certified?: boolean;
    certificationLevel?: string;
  };
  facilities?: string[];
  source: string;
}

// Helper to safely extract text from XML nodes
function extractText(node: any): string | undefined {
  if (!node) return undefined;
  if (typeof node === 'string') return node;
  if (node['#text']) return node['#text'];
  if (node.value?.[0]?.['#text']) return node.value[0]['#text'];
  return undefined;
}

// Helper to extract number from XML nodes
function extractNumber(node: any): number | undefined {
  if (node === undefined || node === null) return undefined;
  if (typeof node === 'number') return node;
  const text = extractText(node);
  return text ? parseFloat(text) : undefined;
}

// Helper to normalize arrays
function ensureArray<T>(item: T | T[] | undefined): T[] {
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

async function fetchAndParseEUData(source: { country: string; name: string; url: string }): Promise<EUParkingFacility[]> {
  try {
    const response = await fetch(source.url, { next: { revalidate: 3600 } }); // Cache for 1 hour
    if (!response.ok) {
      console.error(`Failed to fetch ${source.name} data:`, response.statusText);
      return [];
    }

    const xmlText = await response.text();
    const data = xmlParser.parse(xmlText);

    // Parse DATEX II structure
    const model = data.d2LogicalModel || data['d2:d2LogicalModel'];
    const payloadPublication = model?.payloadPublication;
    const genericPublicationExtension = payloadPublication?.genericPublicationExtension;
    const parkingTablePublication = genericPublicationExtension?.parkingTablePublication;
    const parkingTable = parkingTablePublication?.parkingTable;
    const parkingRecords = ensureArray(parkingTable?.parkingRecord);

    return parkingRecords.map((record: any): EUParkingFacility => {
      const id = record['@_id'] || '';
      const nameValue = record.parkingName?.values?.value;
      const name = extractText(nameValue) || id;

      // Location
      const parkingLocation = record.parkingLocation;
      const pointCoordinates = parkingLocation?.pointByCoordinates?.pointCoordinates ||
                               parkingLocation?.locationForDisplay?.pointByCoordinates?.pointCoordinates;
      const latitude = extractNumber(pointCoordinates?.latitude) || 0;
      const longitude = extractNumber(pointCoordinates?.longitude) || 0;

      // Capacity
      const groupsOfSpaces = ensureArray(record.groupOfParkingSpaces);
      let totalSpaces = 0;
      let hgvSpaces = 0;

      groupsOfSpaces.forEach((group: any) => {
        const spaces = extractNumber(group.parkingNumberOfSpaces) || 0;
        totalSpaces += spaces;
        const vehicleType = extractText(group.parkingSpaceBasics?.parkingUsage?.vehicleCharacteristics?.vehicleType);
        if (vehicleType === 'lorry' || vehicleType === 'hgv') {
          hgvSpaces += spaces;
        }
      });

      // Security
      const securityData = record.parkingSecurity;
      const security = securityData ? {
        certified: extractText(securityData.certificationLevel) !== undefined,
        certificationLevel: extractText(securityData.certificationLevel),
      } : undefined;

      // Facilities
      const equipmentOrServices = ensureArray(record.parkingEquipmentOrServiceFacility);
      const facilities = equipmentOrServices
        .map((item: any) => extractText(item.equipmentOrServiceFacilityType))
        .filter(Boolean) as string[];

      return {
        id: `${source.country}-${id}`,
        country: source.country,
        name,
        location: { latitude, longitude },
        capacity: totalSpaces > 0 ? {
          totalSpaces,
          hgvSpaces: hgvSpaces > 0 ? hgvSpaces : undefined,
        } : undefined,
        security,
        facilities: facilities.length > 0 ? facilities : undefined,
        source: source.name,
      };
    });
  } catch (error) {
    console.error(`Error parsing ${source.name} data:`, error);
    return [];
  }
}

export async function GET() {
  try {
    if (EU_DATA_SOURCES.length === 0) {
      return NextResponse.json({
        facilities: [],
        message: 'No EU data sources configured. Add DATEX II URLs to EU_DATA_SOURCES in app/api/eu-parking/route.ts',
        totalFacilities: 0,
        sources: [],
      });
    }

    // Fetch all EU data sources in parallel
    const results = await Promise.all(
      EU_DATA_SOURCES.map(source => fetchAndParseEUData(source))
    );

    // Flatten results
    const allFacilities = results.flat();

    return NextResponse.json({
      facilities: allFacilities,
      totalFacilities: allFacilities.length,
      sources: EU_DATA_SOURCES.map(s => ({ country: s.country, name: s.name })),
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching EU parking data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch EU parking data' },
      { status: 500 }
    );
  }
}

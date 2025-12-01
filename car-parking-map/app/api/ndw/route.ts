import { NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';
import type {
  NDWParkingFacility,
  NDWParkingStatus,
  NDWEnrichedFacility,
  NDWDataResponse,
} from '@/lib/ndw-types';

const PARKING_TABLE_URL = 'https://opendata.ndw.nu/Truckparking_Parking_Table.xml';
const PARKING_STATUS_URL = 'https://opendata.ndw.nu/Truckparking_Parking_Status.xml';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: true,
});

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

// Helper to normalize arrays (XML parser returns single items as objects, not arrays)
function ensureArray<T>(item: T | T[] | undefined): T[] {
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

export async function GET() {
  try {
    // Fetch both XML files in parallel
    const [tableResponse, statusResponse] = await Promise.all([
      fetch(PARKING_TABLE_URL, { next: { revalidate: 3600 } }), // Cache table for 1 hour
      fetch(PARKING_STATUS_URL, { next: { revalidate: 60 } }), // Cache status for 1 minute
    ]);

    if (!tableResponse.ok || !statusResponse.ok) {
      throw new Error('Failed to fetch NDW data');
    }

    const [tableXml, statusXml] = await Promise.all([
      tableResponse.text(),
      statusResponse.text(),
    ]);

    // Parse XML
    const tableData = xmlParser.parse(tableXml);
    const statusData = xmlParser.parse(statusXml);

    // Extract facilities from Parking Table (DATEX II 2.0)
    const facilities = parseParkingTable(tableData);

    // Extract status from Parking Status (DATEX II 3.0)
    const statusMap = parseParkingStatus(statusData);

    // Merge facilities with their live status
    const enrichedFacilities: NDWEnrichedFacility[] = facilities.map((facility) => ({
      ...facility,
      liveStatus: statusMap.get(facility.id),
    }));

    const response: NDWDataResponse = {
      facilities: enrichedFacilities,
      lastUpdated: new Date().toISOString(),
      tableVersion: extractTableVersion(tableData) || 0,
      totalFacilities: enrichedFacilities.length,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching NDW data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch truck parking data' },
      { status: 500 }
    );
  }
}

function extractTableVersion(data: any): number | undefined {
  try {
    const model = data.d2LogicalModel || data['d2:d2LogicalModel'];
    const payloadPublication = model?.payloadPublication;
    const genericPublicationExtension = payloadPublication?.genericPublicationExtension;
    const parkingTablePublication = genericPublicationExtension?.parkingTablePublication;
    return parkingTablePublication?.parkingTable?.['@_version'];
  } catch {
    return undefined;
  }
}

function parseParkingTable(data: any): NDWParkingFacility[] {
  try {
    const model = data.d2LogicalModel || data['d2:d2LogicalModel'];
    const payloadPublication = model?.payloadPublication;
    const genericPublicationExtension = payloadPublication?.genericPublicationExtension;
    const parkingTablePublication = genericPublicationExtension?.parkingTablePublication;
    const parkingTable = parkingTablePublication?.parkingTable;
    const parkingRecords = ensureArray(parkingTable?.parkingRecord);

    return parkingRecords.map((record: any): NDWParkingFacility => {
      const id = record['@_id'] || '';
      const version = record['@_version'] || 1;

      // Extract name from nested values structure
      const nameValue = record.parkingName?.values?.value;
      const name = extractText(nameValue) || id;

      // Location - DATEX II 2.0 structure
      const parkingLocation = record.parkingLocation;
      const pointCoordinates = parkingLocation?.pointByCoordinates?.pointCoordinates ||
                               parkingLocation?.locationForDisplay?.pointByCoordinates?.pointCoordinates;
      const latitude = extractNumber(pointCoordinates?.latitude) || 0;
      const longitude = extractNumber(pointCoordinates?.longitude) || 0;

      // Address
      const address = record.parkingLocation?.parkingAddress;
      const addressData = address
        ? {
            street: extractText(address.addressLine),
            houseNumber: extractText(address.houseNumber),
            postalCode: extractText(address.postcode),
            city: extractText(address.city),
          }
        : undefined;

      // Capacity
      const groupsOfSpaces = ensureArray(record.groupOfParkingSpaces);
      let totalSpaces = 0;
      let lorrySpaces = 0;
      let refrigeratedSpaces = 0;
      let heavyHaulSpaces = 0;

      groupsOfSpaces.forEach((group: any) => {
        const spaces = extractNumber(group.parkingNumberOfSpaces) || 0;
        totalSpaces += spaces;

        const vehicleType = extractText(group.parkingSpaceBasics?.parkingUsage?.vehicleCharacteristics?.vehicleType);
        if (vehicleType === 'lorry') lorrySpaces += spaces;
        else if (vehicleType === 'refrigeratedGoods') refrigeratedSpaces += spaces;
        else if (vehicleType === 'heavyHaul') heavyHaulSpaces += spaces;
      });

      // Operator
      const operator = record.operator;
      const operatorData = operator
        ? {
            name: extractText(operator.contactOrganisationName),
            email: extractText(operator.contactPersonEmailAddress),
            phone: extractText(operator.contactPersonPhoneNumber),
          }
        : undefined;

      // Pricing
      const tariffsAndPayment = record.tariffsAndPayment;
      const chargeBands = ensureArray(tariffsAndPayment?.chargeBand);
      const firstBand = chargeBands[0];
      const pricingData = tariffsAndPayment
        ? {
            rate: firstBand ? extractNumber(firstBand.charge?.charge) : undefined,
            currency: firstBand ? extractText(firstBand.chargeCurrency) : undefined,
            website: extractText(tariffsAndPayment.urlLinkAddress),
          }
        : undefined;

      // Facilities
      const equipmentOrServices = ensureArray(record.parkingEquipmentOrServiceFacility);
      const facilities = equipmentOrServices
        .map((item: any) => extractText(item.equipmentOrServiceFacilityType))
        .filter(Boolean) as string[];

      // Security
      const securityData = record.parkingSecurity;
      const security = securityData
        ? {
            cctv: extractText(securityData.cctv) === 'true',
            fencing: extractText(securityData.fencing) === 'true',
            lighting: extractText(securityData.lighting) === 'true',
            guards24h: extractText(securityData.securityGuards24H) === 'true',
            patrols: extractText(securityData.securityPatrols) === 'true',
            certified: extractText(securityData.certificationLevel) !== undefined,
            certificationLevel: extractNumber(securityData.certificationLevel),
          }
        : undefined;

      // Access
      const parkingAccess = ensureArray(record.parkingAccess);
      const firstAccess = parkingAccess[0];
      const accessData = firstAccess
        ? {
            motorway: extractText(firstAccess.roadIdentifier),
            junction: extractText(firstAccess.junctionName),
            distance: extractNumber(firstAccess.distanceFromParkingToJunction),
            barrierType: extractText(firstAccess.barrierType),
          }
        : undefined;

      return {
        id,
        version,
        name,
        location: { latitude, longitude },
        address: addressData,
        capacity: {
          totalSpaces,
          lorrySpaces: lorrySpaces > 0 ? lorrySpaces : undefined,
          refrigeratedSpaces: refrigeratedSpaces > 0 ? refrigeratedSpaces : undefined,
          heavyHaulSpaces: heavyHaulSpaces > 0 ? heavyHaulSpaces : undefined,
        },
        operator: operatorData,
        pricing: pricingData,
        facilities: facilities.length > 0 ? facilities : undefined,
        security,
        access: accessData,
      };
    });
  } catch (error) {
    console.error('Error parsing parking table:', error);
    return [];
  }
}

function parseParkingStatus(data: any): Map<string, NDWParkingStatus> {
  const statusMap = new Map<string, NDWParkingStatus>();

  try {
    // DATEX II 3.0 structure
    const payload = data['ns3:payload'] || data.payload;
    const statusRecords = ensureArray(payload?.['ns2:parkingRecordStatus'] || payload?.parkingRecordStatus);

    statusRecords.forEach((statusRecord: any) => {
      const reference = statusRecord['ns2:parkingRecordReference'] || statusRecord.parkingRecordReference;
      const id = reference?.['@_id'];
      if (!id) return;

      // Extract occupancy data
      const occupancyData = statusRecord['ns2:parkingOccupancy'] || statusRecord.parkingOccupancy;
      const vacantSpaces = extractNumber(occupancyData?.['ns2:parkingNumberOfVacantSpaces'] || occupancyData?.parkingNumberOfVacantSpaces) || 0;
      const occupiedSpaces = extractNumber(occupancyData?.['ns2:parkingNumberOfOccupiedSpaces'] || occupancyData?.parkingNumberOfOccupiedSpaces) || 0;
      const occupancy = extractNumber(occupancyData?.['ns2:parkingOccupancy'] || occupancyData?.parkingOccupancy) || 0;

      const status = (extractText(statusRecord['ns2:parkingSiteStatus'] || statusRecord.parkingSiteStatus) || 'unknown') as 'spacesAvailable' | 'full' | 'unknown';
      const timestamp = extractText(statusRecord['ns2:parkingStatusOriginTime'] || statusRecord.parkingStatusOriginTime) || new Date().toISOString();

      // Extract grouped status if available
      const groupedStatuses = ensureArray(statusRecord['ns2:groupOfParkingSpacesStatus'] || statusRecord.groupOfParkingSpacesStatus);
      const groupedStatus = groupedStatuses
        .map((group: any) => {
          const groupOccupancy = group['ns2:groupOfParkingSpacesStatus'] || group.groupOfParkingSpacesStatus;
          return {
            index: group['@_groupIndex'] || 0,
            vacantSpaces: extractNumber(groupOccupancy?.['ns2:parkingNumberOfVacantSpaces'] || groupOccupancy?.parkingNumberOfVacantSpaces) || 0,
            occupiedSpaces: extractNumber(groupOccupancy?.['ns2:parkingNumberOfOccupiedSpaces'] || groupOccupancy?.parkingNumberOfOccupiedSpaces) || 0,
            occupancy: extractNumber(groupOccupancy?.['ns2:parkingOccupancy'] || groupOccupancy?.parkingOccupancy) || 0,
          };
        })
        .filter((g) => g.index !== undefined);

      statusMap.set(id, {
        id,
        vacantSpaces,
        occupiedSpaces,
        occupancy,
        status,
        timestamp,
        groupedStatus: groupedStatus.length > 0 ? groupedStatus : undefined,
      });
    });
  } catch (error) {
    console.error('Error parsing parking status:', error);
  }

  return statusMap;
}

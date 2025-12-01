import { NextResponse } from 'next/server';

/**
 * Zenodo European Truck Parking Dataset API
 *
 * Fetches and parses the Fraunhofer ISI truck parking dataset from Zenodo
 * Dataset: 19,713 truck parking locations across Europe (EU-27, EFTA, UK)
 * Source: https://zenodo.org/records/10231359
 * DOI: 10.5281/zenodo.10231359
 *
 * Data includes:
 * - Truck stop category
 * - Latitude and longitude
 * - Area size
 * - Country assignment
 */

const ZENODO_CSV_URL = 'https://zenodo.org/records/10231359/files/truckParkingLocationsEurope_MediumHigh_v03.csv?download=1';

interface ZenodoFacility {
  id: string;
  name: string;
  category: string;
  location: {
    latitude: number;
    longitude: number;
  };
  country: string;
  area?: number;
  source: string;
}

// Parse CSV data
function parseCSV(csvText: string): ZenodoFacility[] {
  const lines = csvText.trim().split('\n');
  if (lines.length === 0) return [];

  // Parse header - The Zenodo CSV uses semicolons as delimiters
  const headers = lines[0].split(';').map(h => h.trim().replace(/^"|"$/g, ''));

  // Find column indices
  const latIndex = headers.findIndex(h => h.toLowerCase().includes('lat'));
  const lonIndex = headers.findIndex(h => h.toLowerCase().includes('lon'));
  const countryIndex = headers.findIndex(h => h.toLowerCase().includes('country'));
  const categoryIndex = headers.findIndex(h => h.toLowerCase().includes('category') || h.toLowerCase().includes('type'));
  const areaIndex = headers.findIndex(h => h.toLowerCase().includes('area') || h.toLowerCase().includes('size'));
  const nameIndex = headers.findIndex(h => h.toLowerCase().includes('name') || h.toLowerCase().includes('id'));

  console.log('CSV Headers:', headers);
  console.log('Column indices:', { latIndex, lonIndex, countryIndex, categoryIndex, areaIndex, nameIndex });

  const facilities: ZenodoFacility[] = [];

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple CSV parser (handle quoted fields) - Uses semicolon delimiter
    const fields: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ';' && !inQuotes) {
        fields.push(currentField.trim());
        currentField = '';
      } else {
        currentField += char;
      }
    }
    fields.push(currentField.trim()); // Add last field

    // Extract values
    const lat = latIndex >= 0 ? parseFloat(fields[latIndex]) : null;
    const lon = lonIndex >= 0 ? parseFloat(fields[lonIndex]) : null;

    if (lat === null || lon === null || isNaN(lat) || isNaN(lon)) {
      continue; // Skip invalid coordinates
    }

    const country = countryIndex >= 0 ? fields[countryIndex].replace(/^"|"$/g, '') : 'Unknown';
    const category = categoryIndex >= 0 ? fields[categoryIndex].replace(/^"|"$/g, '') : 'parking';
    const area = areaIndex >= 0 ? parseFloat(fields[areaIndex]) : undefined;
    const name = nameIndex >= 0 ? fields[nameIndex].replace(/^"|"$/g, '') : `${country}-${i}`;

    facilities.push({
      id: `zenodo-${country}-${i}`,
      name: name || `Parking ${i}`,
      category,
      location: {
        latitude: lat,
        longitude: lon,
      },
      country,
      area: area && !isNaN(area) ? area : undefined,
      source: 'Zenodo (Fraunhofer ISI)',
    });
  }

  return facilities;
}

export async function GET() {
  try {
    console.log('Fetching Zenodo dataset...');

    // Fetch CSV file
    const response = await fetch(ZENODO_CSV_URL, {
      next: { revalidate: 86400 }, // Cache for 24 hours (static dataset)
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Zenodo data: ${response.statusText}`);
    }

    const csvText = await response.text();
    console.log('CSV downloaded, size:', csvText.length, 'bytes');

    // Parse CSV
    const facilities = parseCSV(csvText);
    console.log('Parsed facilities:', facilities.length);

    // Get country statistics
    const countryStats: Record<string, number> = {};
    facilities.forEach(f => {
      countryStats[f.country] = (countryStats[f.country] || 0) + 1;
    });

    return NextResponse.json({
      facilities,
      totalFacilities: facilities.length,
      countries: Object.keys(countryStats).length,
      countryStats,
      lastUpdated: new Date().toISOString(),
      source: 'Zenodo (Fraunhofer ISI)',
      doi: '10.5281/zenodo.10231359',
      dataset: 'European Truck Parking Locations (Medium-High Confidence)',
    });
  } catch (error) {
    console.error('Error fetching Zenodo data:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch Zenodo truck parking data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

// Cache the data in memory to avoid reading file on every request
let cachedData: any[] | null = null;

interface EnrichedFeature {
  id: string;
  osm_id: number;
  osm_type: string;
  data_source: string;
  last_updated: string;
  tags: any;
  name: string;
  geometry: {
    type: string;
    coordinates: any;
  };
  latitude: number;
  longitude: number;
  location?: {
    highway_type?: string;
    municipality?: string;
    province?: string;
    road?: string;
    postcode?: string;
    highway?: string;
  };
  hgv?: string;
  parking_type?: string;
  confidence_score: number;
  classification: {
    is_truck_parking: boolean;
    is_rest_area: boolean;
    is_service_area: boolean;
    confidence: number;
  };
  capacity?: any;
  facility_type?: string;
}

async function loadAndTransformData(): Promise<EnrichedFeature[]> {
  if (cachedData) {
    return cachedData as EnrichedFeature[];
  }

  const filePath = join(process.cwd(), 'public', 'truck_parking_enriched.json');
  const fileContent = await readFile(filePath, 'utf-8');
  const rawData = JSON.parse(fileContent);

  // Transform the data to add facility_type field
  cachedData = rawData.map((feature: any) => {
    let facility_type = "rest_area";
    if (feature.classification.is_truck_parking) {
      facility_type = "truck_parking";
    } else if (feature.classification.is_service_area) {
      facility_type = "service_area";
    } else if (feature.classification.is_rest_area) {
      facility_type = "rest_area";
    }

    return {
      ...feature,
      facility_type,
    };
  });

  return cachedData as EnrichedFeature[];
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Get filter parameters
    const bounds = searchParams.get('bounds'); // Format: "minLat,minLng,maxLat,maxLng"
    const types = searchParams.get('types')?.split(',') || ['truck_parking', 'service_area', 'rest_area'];
    const search = searchParams.get('search')?.toLowerCase() || '';
    const limit = parseInt(searchParams.get('limit') || '1000', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Load data
    let data = await loadAndTransformData();

    // Filter by viewport bounds if provided
    if (bounds) {
      const [minLat, minLng, maxLat, maxLng] = bounds.split(',').map(parseFloat);
      data = data.filter((feature) => {
        const { latitude, longitude } = feature;
        return latitude >= minLat && latitude <= maxLat &&
               longitude >= minLng && longitude <= maxLng;
      });
    }

    // Filter by facility type
    data = data.filter((feature) => types.includes(feature.facility_type || 'rest_area'));

    // Filter by search term
    if (search) {
      data = data.filter((feature) => {
        return (
          feature.name.toLowerCase().includes(search) ||
          feature.location?.municipality?.toLowerCase().includes(search) ||
          feature.location?.province?.toLowerCase().includes(search) ||
          feature.location?.highway?.toLowerCase().includes(search)
        );
      });
    }

    // Apply pagination
    const total = data.length;
    const paginatedData = data.slice(offset, offset + limit);

    // Calculate stats
    const stats = {
      total: total,
      truck_parking: data.filter(f => f.facility_type === 'truck_parking').length,
      service_area: data.filter(f => f.facility_type === 'service_area').length,
      rest_area: data.filter(f => f.facility_type === 'rest_area').length,
    };

    return NextResponse.json({
      facilities: paginatedData,
      stats,
      total,
      offset,
      limit,
    });
  } catch (error) {
    console.error('Error loading facilities:', error);
    return NextResponse.json(
      { error: 'Failed to load facilities' },
      { status: 500 }
    );
  }
}

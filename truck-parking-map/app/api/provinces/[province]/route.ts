import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Whitelist of allowed province files for security
const ALLOWED_PROVINCES = [
  'groningen', 'friesland', 'drenthe', 'overijssel', 'flevoland',
  'gelderland', 'utrecht', 'noord-holland', 'zuid-holland',
  'zeeland', 'noord-brabant', 'limburg', 'other'
];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ province: string }> }
) {
  try {
    const { province } = await params;

    // Security: Remove file extension if provided and normalize
    let provinceName = province.replace(/_parking_spaces\.geojson\.gz$/, '');

    // Security: Prevent path traversal by removing any path separators
    provinceName = provinceName.replace(/[\/\\\.]/g, '');

    // Security: Convert to lowercase for case-insensitive comparison
    provinceName = provinceName.toLowerCase();

    // Security: Validate against whitelist
    if (!ALLOWED_PROVINCES.includes(provinceName)) {
      return NextResponse.json(
        { error: 'Invalid province name' },
        { status: 400 }
      );
    }

    // Construct file path
    const fileName = `${provinceName}_parking_spaces.geojson.gz`;
    const provincesDir = path.join(process.cwd(), 'public', 'provinces');
    const filePath = path.join(provincesDir, fileName);

    // Security: Verify the resolved path is still within provinces directory
    const resolvedPath = path.resolve(filePath);
    const resolvedProvincesDir = path.resolve(provincesDir);
    if (!resolvedPath.startsWith(resolvedProvincesDir)) {
      return NextResponse.json(
        { error: 'Invalid file path' },
        { status: 403 }
      );
    }

    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      return NextResponse.json(
        { error: 'Province file not found' },
        { status: 404 }
      );
    }

    // Read gzipped file
    const fileBuffer = fs.readFileSync(resolvedPath);

    // Return with proper headers for gzip content
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year
      },
    });
  } catch (error) {
    console.error('Error serving province file:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

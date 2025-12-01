"use client";

import dynamic from "next/dynamic";

// GPU-accelerated map component using deck.gl (handles 100k+ points efficiently)
const CarParkingMapGPU = dynamic(
  () => import("@/components/car-parking-map-gpu"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Loading GPU-accelerated map...</p>
      </div>
    ),
  }
);

export default function Home() {
  return <CarParkingMapGPU />;
}

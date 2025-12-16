import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Car Parking Netherlands",
  description: "Interactive map of car parking facilities in the Netherlands",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script id="suppress-webgpu-errors" strategy="beforeInteractive">
          {`
            // Suppress WebGPU errors from luma.gl when it falls back to WebGL
            window.addEventListener('error', function(e) {
              if (e.message && e.message.includes('maxTextureDimension2D')) {
                e.preventDefault();
                e.stopPropagation();
                return true;
              }
            });
          `}
        </Script>
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}

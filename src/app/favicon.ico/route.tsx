import { ImageResponse } from "next/og";

const iconSizes = [16, 32, 48, 64, 128, 256] as const;

function iconArtwork(size: number) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f97316",
        borderRadius: Math.round(size * 0.22),
      }}
    >
      <div
        style={{
          width: "72%",
          height: "72%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fffaf3",
          borderRadius: "50%",
          fontSize: Math.round(size * 0.5),
        }}
      >
        🍽️
      </div>
    </div>
  );
}

// Some browsers request this conventional path even when a PNG app icon is
// declared in metadata. A real multi-size ICO gives Safari and Chromium the
// small tab-icon sizes they expect instead of letting them retain Vercel's
// fallback favicon.
export const dynamic = "force-static";

export async function GET() {
  const images = await Promise.all(
    iconSizes.map(async (size) => {
      const image = new ImageResponse(iconArtwork(size), {
        width: size,
        height: size,
      });
      return { size, bytes: new Uint8Array(await image.arrayBuffer()) };
    }),
  );
  const directorySize = 6 + images.length * 16;
  const icoBytes = new Uint8Array(
    directorySize + images.reduce((total, image) => total + image.bytes.length, 0),
  );
  const view = new DataView(icoBytes.buffer);
  view.setUint16(0, 0, true); // ICO reserved
  view.setUint16(2, 1, true); // icon type
  view.setUint16(4, images.length, true);

  let imageOffset = directorySize;
  for (const [index, image] of images.entries()) {
    const entryOffset = 6 + index * 16;
    // An ICO records 256px as 0.
    icoBytes[entryOffset] = image.size === 256 ? 0 : image.size;
    icoBytes[entryOffset + 1] = image.size === 256 ? 0 : image.size;
    icoBytes[entryOffset + 2] = 0;
    icoBytes[entryOffset + 3] = 0;
    view.setUint16(entryOffset + 4, 1, true);
    view.setUint16(entryOffset + 6, 32, true);
    view.setUint32(entryOffset + 8, image.bytes.length, true);
    view.setUint32(entryOffset + 12, imageOffset, true);
    icoBytes.set(image.bytes, imageOffset);
    imageOffset += image.bytes.length;
  }

  return new Response(icoBytes, {
    headers: {
      "Content-Type": "image/x-icon",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}

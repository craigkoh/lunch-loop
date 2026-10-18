import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f97316", borderRadius: "112px" }}>
      <div style={{ width: "72%", height: "72%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fffaf3", borderRadius: "50%", fontSize: 250 }}>🍽️</div>
    </div>,
    { ...size },
  );
}

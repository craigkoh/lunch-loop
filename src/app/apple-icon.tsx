import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f97316", borderRadius: "40px" }}>
      <div style={{ width: "72%", height: "72%", display: "flex", alignItems: "center", justifyContent: "center", background: "#fffaf3", borderRadius: "50%", fontSize: 88 }}>🍽️</div>
    </div>,
    { ...size },
  );
}

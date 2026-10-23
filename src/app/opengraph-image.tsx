import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Lunch Loop — the fun lunch loop for 2–6 friends";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const icon = await readFile(join(process.cwd(), "src/app/icon.png"));
  const src = `data:image/png;base64,${icon.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          background: "#FFF7ED",
          padding: "72px 80px",
        }}
      >
        <img
          src={src}
          width={280}
          height={280}
          alt=""
          style={{ borderRadius: 64 }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginLeft: 56,
            maxWidth: 700,
          }}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: 4,
              color: "#9A3412",
            }}
          >
            LUNCH LOOP
          </div>
          <div
            style={{
              marginTop: 16,
              fontSize: 76,
              lineHeight: 1,
              fontWeight: 800,
              color: "#7C2D12",
              letterSpacing: -2,
            }}
          >
            The fun lunch loop for friends.
          </div>
          <div
            style={{
              marginTop: 24,
              fontSize: 32,
              lineHeight: 1.35,
              color: "#57534E",
            }}
          >
            2–6 friends. Turns, vetoes, and a shared list.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}

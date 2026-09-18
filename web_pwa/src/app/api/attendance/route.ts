import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || req.headers.get("x-erp-token");

    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: "Authorization token required" },
        { status: 401 }
      );
    }

    const token = authHeader.startsWith("GlobalEducation ")
      ? authHeader
      : `GlobalEducation ${authHeader}`;

    const res = await fetch(
      "https://kiet.cybervidya.net/api/attendance/course/component/student",
      {
        headers: {
          Authorization: token,
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        cache: "no-store",
      }
    );

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to fetch attendance";
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

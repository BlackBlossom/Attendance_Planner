import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || req.headers.get("x-erp-token");
    const uidHeader = req.headers.get("x-erp-uid") || req.headers.get("uid") || "1405";

    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: "Authorization token required" },
        { status: 401 }
      );
    }

    const token = authHeader.startsWith("GlobalEducation ")
      ? authHeader
      : `GlobalEducation ${authHeader}`;

    const { searchParams } = new URL(req.url);
    let weekStartDate = searchParams.get("weekStartDate");
    let weekEndDate = searchParams.get("weekEndDate");

    // If dates not provided, default to current week (Sunday to Saturday)
    if (!weekStartDate || !weekEndDate) {
      const now = new Date();
      const day = now.getDay();
      const sunday = new Date(now);
      sunday.setDate(now.getDate() - day);
      const saturday = new Date(sunday);
      saturday.setDate(sunday.getDate() + 6);

      const fmt = (d: Date) => d.toISOString().split("T")[0];
      weekStartDate = fmt(sunday);
      weekEndDate = fmt(saturday);
    }

    // Check span between start and end
    const startObj = new Date(weekStartDate);
    const endObj = new Date(weekEndDate);
    const diffDays = Math.ceil((endObj.getTime() - startObj.getTime()) / (1000 * 60 * 60 * 24));

    // Slice into 7-day weekly intervals if range is wide
    const intervals: { start: string; end: string }[] = [];
    if (diffDays <= 7) {
      intervals.push({ start: weekStartDate, end: weekEndDate });
    } else {
      let curr = new Date(startObj);
      while (curr < endObj) {
        const nextEnd = new Date(curr);
        nextEnd.setDate(curr.getDate() + 6);
        const actualEnd = nextEnd > endObj ? endObj : nextEnd;

        const fmt = (d: Date) => d.toISOString().split("T")[0];
        intervals.push({ start: fmt(curr), end: fmt(actualEnd) });

        curr.setDate(curr.getDate() + 7);
      }
    }

    // Fetch all schedule intervals in parallel
    const results = await Promise.allSettled(
      intervals.map(async ({ start, end }) => {
        const url = `https://kiet.cybervidya.net/api/student/schedule/class?weekEndDate=${end}&weekStartDate=${start}`;
        const res = await fetch(url, {
          headers: {
            Authorization: token,
            UID: uidHeader,
            Accept: "application/json, text/plain, */*",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          cache: "no-store",
        });

        if (!res.ok) return [];
        const json = await res.json();
        return Array.isArray(json.data) ? json.data : [];
      })
    );

    // Combine and deduplicate
    const combinedClasses: any[] = [];
    const seen = new Set<string>();

    for (const res of results) {
      if (res.status === "fulfilled" && Array.isArray(res.value)) {
        for (const cls of res.value) {
          if (cls.type !== "CLASS") continue;
          const key = `${cls.courseCode}_${cls.start}`;
          if (!seen.has(key)) {
            seen.add(key);
            combinedClasses.push(cls);
          }
        }
      }
    }

    // Sort chronologically by start date/time
    combinedClasses.sort((a, b) => {
      const getMillis = (str: string) => {
        if (!str) return 0;
        if (str.includes("/")) {
          const [dmy, time] = str.split(" ");
          const [d, m, y] = dmy.split("/");
          return new Date(`${y}-${m}-${d}T${time || "00:00:00"}`).getTime();
        }
        return new Date(str).getTime();
      };
      return getMillis(a.start) - getMillis(b.start);
    });

    return NextResponse.json({
      success: true,
      count: combinedClasses.length,
      weekStartDate,
      weekEndDate,
      data: combinedClasses,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to fetch schedule";
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

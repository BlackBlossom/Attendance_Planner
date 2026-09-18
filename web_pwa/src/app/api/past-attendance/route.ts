import { NextRequest, NextResponse } from "next/server";
import { DayWiseStatus } from "@/lib/types";

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

    // Step 1: Fetch registered courses
    const regRes = await fetch("https://kiet.cybervidya.net/api/student/dashboard/registered-courses", {
      headers: {
        Authorization: token,
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      cache: "no-store",
    });

    if (!regRes.ok) {
      return NextResponse.json({ success: false, error: "Failed to fetch registered courses" }, { status: regRes.status });
    }

    const regData = await regRes.json();
    const courses = regData.data || [];

    // Step 2: Extract all component queries
    interface CompQuery {
      studentId: number;
      courseId: number;
      courseCode: string;
      courseName: string;
      courseCompId: number;
      courseCompName: string;
    }

    const queries: CompQuery[] = [];
    for (const c of courses) {
      const studentId = c.studentId;
      const courseId = c.courseId;
      const courseCode = c.courseCode || "";
      const courseName = c.courseName || "";
      for (const comp of c.studentCourseCompDetails || []) {
        queries.push({
          studentId,
          courseId,
          courseCode,
          courseName,
          courseCompId: comp.courseCompId,
          courseCompName: comp.courseCompName,
        });
      }
    }

    // Step 3: Fetch lecture-by-lecture history for all components in parallel
    const lectureResults = await Promise.allSettled(
      queries.map(async (q) => {
        const res = await fetch(
          "https://kiet.cybervidya.net/api/attendance/schedule/student/course/attendance/percentage",
          {
            method: "POST",
            headers: {
              Authorization: token,
              "Content-Type": "application/json",
              Accept: "application/json",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
            body: JSON.stringify({
              studentId: q.studentId,
              sessionId: null,
              courseId: q.courseId,
              courseCompId: q.courseCompId,
            }),
            cache: "no-store",
          }
        );
        if (!res.ok) return [];
        const json = await res.json();
        const records = json.data || [];
        return records.map((r: any) => ({
          ...r,
          courseName: q.courseName,
          courseCode: q.courseCode,
          courseCompName: q.courseCompName,
        }));
      })
    );

    // Step 4: Group and aggregate lectures by Date (YYYY-MM-DD)
    const dateMap: { [dateStr: string]: DayWiseStatus } = {};

    lectureResults.forEach((result) => {
      if (result.status !== "fulfilled") return;
      const list = result.value;

      list.forEach((item: any) => {
        const rawDate = item.lectureDate || item.date || item.strLectureDate;
        if (!rawDate) return;

        let dateKey = rawDate;
        // Normalize DD/MM/YYYY or DD-MM-YYYY to YYYY-MM-DD
        if (rawDate.includes("/")) {
          const parts = rawDate.split(" ")[0].split("/");
          if (parts.length === 3) dateKey = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        } else if (rawDate.includes("-") && rawDate.split("-")[0].length === 2) {
          const parts = rawDate.split(" ")[0].split("-");
          if (parts.length === 3) dateKey = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        }

        if (!dateMap[dateKey]) {
          dateMap[dateKey] = {
            date: dateKey,
            totalLectures: 0,
            presentLectures: 0,
            absentLectures: 0,
            isFullDayAbsent: false,
            lectures: [],
          };
        }

        const isPresent = item.attendanceStatus === "P" || item.present === true || item.status === "PRESENT";
        const statusVal = isPresent ? "P" : "A";

        dateMap[dateKey].totalLectures += 1;
        if (isPresent) {
          dateMap[dateKey].presentLectures += 1;
        } else {
          dateMap[dateKey].absentLectures += 1;
        }

        dateMap[dateKey].lectures.push({
          courseName: item.courseName || "Subject",
          compName: item.courseCompName || "Class",
          status: statusVal,
          time: item.strLectureTime || item.lectureTime || undefined,
        });
      });
    });

    // Mark full-day absents
    const daysArray = Object.values(dateMap).map((day) => ({
      ...day,
      isFullDayAbsent: day.totalLectures > 0 && day.presentLectures === 0,
    }));

    // Sort by date descending
    daysArray.sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({
      success: true,
      totalDaysTracked: daysArray.length,
      days: daysArray,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to fetch past attendance";
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

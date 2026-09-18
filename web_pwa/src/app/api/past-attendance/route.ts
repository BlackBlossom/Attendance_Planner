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

    // Step 1: Fetch registered courses to get studentId, courseId, and courseCompId
    const regRes = await fetch(
      "https://kiet.cybervidya.net/api/student/dashboard/registered-courses",
      {
        headers: {
          Authorization: token,
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        cache: "no-store",
      }
    );

    if (!regRes.ok) {
      return NextResponse.json(
        { success: false, error: "Failed to fetch registered courses" },
        { status: regRes.status }
      );
    }

    const regData = await regRes.json();
    const courses = regData.data || [];

    // Step 2: Build queries for each course component
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
        if (comp.courseCompId) {
          queries.push({
            studentId,
            courseId,
            courseCode,
            courseName,
            courseCompId: comp.courseCompId,
            courseCompName: comp.courseCompName || "Class",
          });
        }
      }
    }

    // Step 3: Fetch lecture-by-lecture history with bounded batching (4 concurrent requests)
    // to avoid overloading CyberVidya's ERP server
    const batchSize = 4;
    const allLectureRecords: any[] = [];

    for (let i = 0; i < queries.length; i += batchSize) {
      const batch = queries.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(async (q) => {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);

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
                signal: controller.signal,
                cache: "no-store",
              }
            );

            clearTimeout(timeoutId);
            if (!res.ok) return [];

            const json = await res.json();
            const dataItems = json.data || [];

            // Extract individual lectures from data[i].lectureList
            const lectures: any[] = [];
            for (const topItem of dataItems) {
              if (Array.isArray(topItem.lectureList) && topItem.lectureList.length > 0) {
                for (const lec of topItem.lectureList) {
                  lectures.push({
                    ...lec,
                    courseName: q.courseName || lec.courseName,
                    courseCode: q.courseCode || lec.courseCode,
                    courseCompName: q.courseCompName || lec.courseCompName,
                  });
                }
              } else if (topItem.planLecDate || topItem.lectureDate) {
                lectures.push({
                  ...topItem,
                  courseName: q.courseName || topItem.courseName,
                  courseCode: q.courseCode || topItem.courseCode,
                  courseCompName: q.courseCompName || topItem.courseCompName,
                });
              }
            }

            return lectures;
          } catch (e) {
            console.error(`Error fetching lectures for course ${q.courseCode}:`, e);
            return [];
          }
        })
      );

      batchResults.forEach((res) => {
        if (res.status === "fulfilled" && Array.isArray(res.value)) {
          allLectureRecords.push(...res.value);
        }
      });
    }

    // Step 4: Group and aggregate lectures by Date (normalized to YYYY-MM-DD)
    const dateMap: { [dateStr: string]: DayWiseStatus } = {};

    for (const item of allLectureRecords) {
      // In CyberVidya ERP, the date is in planLecDate (e.g. "2026-08-31") or lectureDate
      const rawDate = item.planLecDate || item.lectureDate || item.date || item.strPlanDate;
      if (!rawDate) continue;

      let dateKey = String(rawDate).trim();
      // Handle DD/MM/YYYY or DD-MM-YYYY if present
      if (dateKey.includes("/")) {
        const parts = dateKey.split(" ")[0].split("/");
        if (parts.length === 3) {
          dateKey = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        }
      } else if (dateKey.includes("-") && dateKey.split("-")[0].length === 2) {
        const parts = dateKey.split(" ")[0].split("-");
        if (parts.length === 3) {
          dateKey = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
        }
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

      // In CyberVidya, attendance is "PRESENT" or "ABSENT"
      const isPresent =
        item.attendance === "PRESENT" ||
        item.attendanceStatus === "P" ||
        item.present === true;

      dateMap[dateKey].totalLectures += 1;
      if (isPresent) {
        dateMap[dateKey].presentLectures += 1;
      } else {
        dateMap[dateKey].absentLectures += 1;
      }

      dateMap[dateKey].lectures.push({
        courseName: item.courseName || "Subject",
        compName: item.courseCompName || "Class",
        status: isPresent ? "P" : "A",
        time: item.timeSlot || item.strLectureTime || item.lectureTime || undefined,
      });
    }

    // Step 5: Mark full-day absences (totalLectures > 0 and presentLectures === 0)
    const daysArray = Object.values(dateMap).map((day) => ({
      ...day,
      isFullDayAbsent: day.totalLectures > 0 && day.presentLectures === 0,
    }));

    // Sort descending (latest dates first)
    daysArray.sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({
      success: true,
      totalDaysTracked: daysArray.length,
      totalLecturesCaptured: allLectureRecords.length,
      days: daysArray,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to fetch past attendance";
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

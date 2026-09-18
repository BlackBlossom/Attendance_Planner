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

    const headers = {
      Authorization: token,
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    };

    // Parallel fetch profile, photo, cgpa, and upcoming classes
    const [profileRes, photoRes, cgpaRes, upcomingRes, examsRes] = await Promise.allSettled([
      fetch("https://kiet.cybervidya.net/api/admin/user/my-profile", { headers, cache: "no-store" }),
      fetch("https://kiet.cybervidya.net/api/admission/student/assets/get", { headers, cache: "no-store" }),
      fetch("https://kiet.cybervidya.net/api/student/dashboard/performance", { headers, cache: "no-store" }),
      fetch("https://kiet.cybervidya.net/api/student/dashboard/upcoming/classes", { headers, cache: "no-store" }),
      fetch("https://kiet.cybervidya.net/api/student/dashboard/upcomming/exams", { headers, cache: "no-store" }),
    ]);

    let profileData = null;
    if (profileRes.status === "fulfilled" && profileRes.value.ok) {
      const json = await profileRes.value.json();
      profileData = json.data;
    }

    let photoBase64 = null;
    if (photoRes.status === "fulfilled" && photoRes.value.ok) {
      photoBase64 = await photoRes.value.text();
      if (photoBase64.startsWith('"') && photoBase64.endsWith('"')) {
        photoBase64 = photoBase64.slice(1, -1);
      }
    }

    let cgpa = null;
    if (cgpaRes.status === "fulfilled" && cgpaRes.value.ok) {
      const json = await cgpaRes.value.json();
      cgpa = json.data;
    }

    let upcomingClasses = [];
    if (upcomingRes.status === "fulfilled" && upcomingRes.value.ok) {
      const json = await upcomingRes.value.json();
      upcomingClasses = json.data || [];
    }

    let exams = [];
    if (examsRes.status === "fulfilled" && examsRes.value.ok) {
      const json = await examsRes.value.json();
      exams = json.data || [];
    }

    return NextResponse.json({
      success: true,
      profile: profileData,
      photo: photoBase64,
      cgpa,
      upcomingClasses,
      exams,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to fetch student profile";
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

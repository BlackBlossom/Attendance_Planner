import { ScheduleClassItem } from "./types";

function formatDateToICS(dateStr: string): string {
  // input: "14/09/2026 10:50:00" -> output: "20260914T105000"
  if (dateStr.includes("/")) {
    const [dmy, time] = dateStr.split(" ");
    const [d, m, y] = dmy.split("/");
    const [hh, mm, ss] = (time || "00:00:00").split(":");
    return `${y}${m.padStart(2, "0")}${d.padStart(2, "0")}T${hh.padStart(2, "0")}${mm.padStart(2, "0")}${ss ? ss.padStart(2, "0") : "00"}`;
  }
  const d = new Date(dateStr);
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export function generateICS(events: ScheduleClassItem[], calendarName = "College Timetable"): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Attendance Planner//PWA Timetable//EN",
    `X-WR-CALNAME:${calendarName}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  events.forEach((evt, idx) => {
    try {
      const dtStart = formatDateToICS(evt.start);
      const dtEnd = formatDateToICS(evt.end);
      const summary = `${evt.courseName} (${evt.courseCompName || "Class"})`;
      const description = evt.content || `${evt.courseCode} - ${evt.title}`;
      const location = evt.content?.includes("Class Room :")
        ? evt.content.split("Class Room :")[1].trim()
        : evt.content || "KIET Campus";

      lines.push(
        "BEGIN:VEVENT",
        `UID:${Date.now()}-${idx}@attendanceplanner.app`,
        `DTSTAMP:${formatDateToICS(new Date().toISOString())}`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        `LOCATION:${location}`,
        "STATUS:CONFIRMED",
        "END:VEVENT"
      );
    } catch {
      // skip malformed dates
    }
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

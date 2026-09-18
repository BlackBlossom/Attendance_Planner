"use client";

import React, { useState } from "react";
import {
  CalendarDays,
  Download,
  CheckSquare,
  Square,
  Clock,
  MapPin,
  Sparkles,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { ScheduleClassItem, AttendanceCourseItem } from "@/lib/types";
import { generateICS } from "@/lib/ics";

interface SchedulePlannerProps {
  schedule: ScheduleClassItem[];
  courses: AttendanceCourseItem[];
  onExportICS: () => void;
  isLoading: boolean;
}

export const SchedulePlanner: React.FC<SchedulePlannerProps> = ({
  schedule,
  courses,
  isLoading,
}) => {
  // Store toggled state: class index or id -> boolean
  const [plannedMap, setPlannedMap] = useState<{ [key: number]: boolean }>(() => {
    const initial: { [key: number]: boolean } = {};
    schedule.forEach((_, idx) => {
      initial[idx] = true; // default: plan to attend all future classes
    });
    return initial;
  });

  const toggleClass = (idx: number) => {
    setPlannedMap((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const markAll = (attend: boolean) => {
    const updated: { [key: number]: boolean } = {};
    schedule.forEach((_, idx) => {
      updated[idx] = attend;
    });
    setPlannedMap(updated);
  };

  // Base overall numbers
  let basePresent = 0;
  let baseTotal = 0;
  courses.forEach((c) => {
    c.attendanceCourseComponentNameInfoList.forEach((comp) => {
      basePresent += comp.numberOfPresent || 0;
      baseTotal += comp.numberOfPeriods || 0;
    });
  });

  // Calculate planned future additions
  let plannedAttended = 0;
  const plannedTotal = schedule.length;

  schedule.forEach((_, idx) => {
    if (plannedMap[idx] ?? true) {
      plannedAttended += 1;
    }
  });

  const projectedTotal = baseTotal + plannedTotal;
  const projectedPresent = basePresent + plannedAttended;
  const currentPercentage = baseTotal > 0 ? (basePresent / baseTotal) * 100 : 0;
  const projectedPercentage =
    projectedTotal > 0 ? (projectedPresent / projectedTotal) * 100 : currentPercentage;

  const handleExport = () => {
    const icsContent = generateICS(schedule, "CyberVidya Schedule");
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `timetable_${Date.now()}.ics`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>Future Attendance Projection & Planner</span>
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Uncheck classes you plan to miss and see how your attendance % responds in real time.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start">
          <button
            onClick={handleExport}
            disabled={schedule.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shadow-xs disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Timetable (.ics)</span>
          </button>
        </div>
      </div>

      {/* Projection Impact Box */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-gradient-to-br from-indigo-50/70 to-purple-50/70 dark:from-indigo-950/20 dark:to-purple-950/20 border border-indigo-100 dark:border-indigo-900/50">
        <div>
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Current Attendance</span>
          <div className="text-xl font-extrabold text-zinc-900 dark:text-zinc-100 mt-0.5">
            {Math.round(currentPercentage * 10) / 10}%
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {basePresent} / {baseTotal} periods
          </div>
        </div>

        <div>
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Planned Classes</span>
          <div className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5">
            {plannedAttended} / {plannedTotal} attended
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {plannedTotal - plannedAttended} planned bunks
          </div>
        </div>

        <div>
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            <span>Projected Attendance</span>
          </span>
          <div
            className={`text-xl font-extrabold mt-0.5 ${
              projectedPercentage >= 75
                ? "text-emerald-600 dark:text-emerald-400"
                : projectedPercentage >= 65
                ? "text-amber-600 dark:text-amber-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {Math.round(projectedPercentage * 10) / 10}%
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {projectedPercentage >= 75
              ? "Maintains above 75% requirement"
              : `Below 75% by ${Math.round((75 - projectedPercentage) * 10) / 10}%`}
          </div>
        </div>
      </div>

      {/* Bulk actions */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-500 dark:text-zinc-400 font-medium">
          Upcoming classes found: {schedule.length}
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => markAll(true)}
            className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
          >
            Attend All
          </button>
          <span>•</span>
          <button
            onClick={() => markAll(false)}
            className="text-rose-600 dark:text-rose-400 font-semibold hover:underline"
          >
            Miss All
          </button>
        </div>
      </div>

      {/* Schedule Items List */}
      {schedule.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <CalendarDays className="w-10 h-10 mx-auto text-zinc-400 mb-2" />
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            No schedule events found for this week.
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Classes may not be scheduled for the selected date range or timetable API has no records.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {schedule.map((item, idx) => {
            const isAttending = plannedMap[idx] ?? true;
            return (
              <div
                key={idx}
                onClick={() => toggleClass(idx)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                  isAttending
                    ? "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-indigo-400"
                    : "bg-zinc-50/80 dark:bg-zinc-900/40 border-zinc-200/50 dark:border-zinc-800/50 opacity-60 line-through decoration-zinc-400"
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleClass(idx);
                    }}
                    className={`p-1 rounded-md transition-colors ${
                      isAttending
                        ? "text-indigo-600 dark:text-indigo-400"
                        : "text-zinc-400 dark:text-zinc-600"
                    }`}
                  >
                    {isAttending ? (
                      <CheckSquare className="w-5 h-5" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>

                  <div>
                    <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                      {item.courseName || item.title}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>
                          {item.start.split(" ")[1]?.slice(0, 5)} - {item.end.split(" ")[1]?.slice(0, 5)}
                        </span>
                      </span>
                      <span>•</span>
                      <span>{item.start.split(" ")[0]}</span>
                      {item.content && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            <span>{item.content}</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <span
                  className={`px-2 py-1 rounded text-xs font-semibold ${
                    isAttending
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                      : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400"
                  }`}
                >
                  {isAttending ? "Attending" : "Bunked"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

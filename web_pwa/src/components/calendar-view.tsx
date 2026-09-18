"use client";

import React, { useState, useEffect } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  AlertOctagon,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  BookOpen,
  CalendarDays,
  Filter,
} from "lucide-react";
import { DayWiseStatus } from "@/lib/types";

interface CalendarViewProps {
  days: DayWiseStatus[];
}

export const CalendarView: React.FC<CalendarViewProps> = ({ days }) => {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<DayWiseStatus | null>(null);
  const [viewFilter, setViewFilter] = useState<"all" | "missedAny" | "fullAbsent">("all");

  // Automatically align to the latest month with attendance records
  useEffect(() => {
    if (days.length > 0 && days[0].date) {
      const parts = days[0].date.split("-");
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        setCurrentDate(new Date(y, m, 1));
      }
    }
  }, [days]);

  // Build map of YYYY-MM-DD -> DayWiseStatus
  const dayMap: { [dateStr: string]: DayWiseStatus } = {};
  days.forEach((d) => {
    dayMap[d.date] = d;
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  const startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday
  const totalDaysInMonth = lastDayOfMonth.getDate();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Calculate statistics for current month
  let monthFullDayAbsents = 0;
  let monthPartialAbsents = 0;
  let monthAttendedCount = 0;
  let monthTotalLectures = 0;

  for (let d = 1; d <= totalDaysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayData = dayMap[key];
    if (dayData) {
      if (dayData.isFullDayAbsent) {
        monthFullDayAbsents++;
      } else if (dayData.absentLectures > 0) {
        monthPartialAbsents++;
      }
      monthAttendedCount += dayData.presentLectures;
      monthTotalLectures += dayData.totalLectures;
    }
  }

  // Days grid cells
  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < startDayOfWeek; i++) {
    calendarCells.push(null);
  }
  for (let d = 1; d <= totalDaysInMonth; d++) {
    calendarCells.push(d);
  }

  const allFullDayAbsentDays = days.filter((d) => d.isFullDayAbsent);
  const allMissedAnyDays = days.filter((d) => d.absentLectures > 0);

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>Attendance History & Absence Calendar</span>
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Track daily attendance. Full-day and partial missed lectures are clearly marked.
          </p>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center gap-2 self-start">
          <button
            onClick={handlePrevMonth}
            className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100 min-w-[120px] text-center">
            {monthNames[month]} {year}
          </span>
          <button
            onClick={handleNextMonth}
            className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Month Statistics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Lectures Held</div>
          <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">{monthTotalLectures}</div>
        </div>
        <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
          <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Attended Lectures</div>
          <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{monthAttendedCount}</div>
        </div>
        <div className="p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60">
          <div className="text-xs text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Partial Missed Days</span>
          </div>
          <div className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5">
            {monthPartialAbsents} {monthPartialAbsents === 1 ? "day" : "days"}
          </div>
        </div>
        <div className="p-3 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60">
          <div className="text-xs text-rose-700 dark:text-rose-400 font-medium flex items-center gap-1">
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>Full-Day Absent</span>
          </div>
          <div className="text-lg font-bold text-rose-600 dark:text-rose-400 mt-0.5">
            {monthFullDayAbsents} {monthFullDayAbsents === 1 ? "day" : "days"}
          </div>
        </div>
      </div>

      {/* Legend & Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs">
        {/* Color Legend */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-300">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>100% Present</span>
          </div>
          <div className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span>Missed Some Lectures</span>
          </div>
          <div className="flex items-center gap-1.5 font-medium text-rose-700 dark:text-rose-400">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <span>Full-Day Absent (Missed All)</span>
          </div>
        </div>

        {/* View Filter Pill */}
        <div className="inline-flex rounded-lg p-1 bg-zinc-100 dark:bg-zinc-800 text-xs font-medium self-start">
          <button
            onClick={() => setViewFilter("all")}
            className={`px-2.5 py-1 rounded-md transition-all ${
              viewFilter === "all"
                ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            Calendar Grid
          </button>
          <button
            onClick={() => setViewFilter("missedAny")}
            className={`px-2.5 py-1 rounded-md transition-all ${
              viewFilter === "missedAny"
                ? "bg-amber-500 text-white shadow-xs font-bold"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            Missed Classes ({allMissedAnyDays.length})
          </button>
          <button
            onClick={() => setViewFilter("fullAbsent")}
            className={`px-2.5 py-1 rounded-md transition-all ${
              viewFilter === "fullAbsent"
                ? "bg-rose-600 text-white shadow-xs font-bold"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            Full-Day Absents ({allFullDayAbsentDays.length})
          </button>
        </div>
      </div>

      {/* Grid View */}
      {viewFilter === "all" ? (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-xs">
          {/* Days Header */}
          <div className="grid grid-cols-7 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-800/40 text-center py-2.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            <span>Sun</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 divide-x divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {calendarCells.map((dayNum, idx) => {
              if (dayNum === null) {
                return <div key={`empty-${idx}`} className="h-24 bg-zinc-50/30 dark:bg-zinc-900/20" />;
              }

              const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
              const data = dayMap[dateKey];
              const isFullAbsent = data?.isFullDayAbsent;
              const isPartialAbsent = data && !isFullAbsent && data.absentLectures > 0;
              const hasClasses = !!(data && data.totalLectures > 0);
              const isSelected = selectedDay?.date === dateKey;

              return (
                <div
                  key={dateKey}
                  onClick={() => data && setSelectedDay(data)}
                  className={`h-24 p-2 transition-all flex flex-col justify-between ${
                    hasClasses
                      ? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                      : "bg-white dark:bg-zinc-900"
                  } ${isSelected ? "ring-2 ring-indigo-500 inset-0" : ""} ${
                    isFullAbsent
                      ? "bg-rose-50/70 dark:bg-rose-950/20 border-rose-200/60"
                      : isPartialAbsent
                      ? "bg-amber-50/50 dark:bg-amber-950/10"
                      : ""
                  }`}
                >
                  {/* Date number & Badges */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                        isFullAbsent
                          ? "bg-rose-600 text-white shadow-xs"
                          : isPartialAbsent
                          ? "bg-amber-500 text-white"
                          : "text-zinc-800 dark:text-zinc-200"
                      }`}
                    >
                      {dayNum}
                    </span>

                    {isFullAbsent && (
                      <span className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200">
                        Absent
                      </span>
                    )}

                    {isPartialAbsent && (
                      <span className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200">
                        Missed {data.absentLectures}
                      </span>
                    )}
                  </div>

                  {/* Day status preview */}
                  {hasClasses && (
                    <div className="mt-1 text-[11px] space-y-0.5">
                      {isFullAbsent ? (
                        <div className="text-rose-600 dark:text-rose-400 font-semibold text-[10px] leading-tight">
                          Missed all {data.totalLectures}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 font-medium text-zinc-600 dark:text-zinc-400">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              isPartialAbsent ? "bg-amber-500" : "bg-emerald-500"
                            }`}
                          />
                          <span>
                            {data.presentLectures}/{data.totalLectures} Attended
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Filtered List View (Missed Lectures or Full Absent) */
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-800/40 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
              {viewFilter === "fullAbsent" ? "Full-Day Absent Dates" : "All Dates With Missed Lectures"}
            </span>
            <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
              Total: {viewFilter === "fullAbsent" ? allFullDayAbsentDays.length : allMissedAnyDays.length} Days
            </span>
          </div>

          <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-[500px] overflow-y-auto">
            {(viewFilter === "fullAbsent" ? allFullDayAbsentDays : allMissedAnyDays).map((day) => {
              const missedList = day.lectures.filter((l) => l.status === "A");
              return (
                <div
                  key={day.date}
                  onClick={() => setSelectedDay(day)}
                  className="p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                        day.isFullDayAbsent
                          ? "bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400"
                          : "bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {day.isFullDayAbsent ? (
                        <AlertOctagon className="w-5 h-5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <span>{day.date}</span>
                        {day.isFullDayAbsent ? (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300">
                            Full-Day Absent
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300">
                            Missed {day.absentLectures} of {day.totalLectures}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Missed: {missedList.map((l) => l.courseName).join(", ")}
                      </div>
                    </div>
                  </div>

                  <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200">
                    Inspect Lectures →
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected Day Modal / Details Drawer */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Attendance Breakdown ({selectedDay.date})</span>
                </h3>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {selectedDay.presentLectures} attended • {selectedDay.absentLectures} missed of {selectedDay.totalLectures} total
                </div>
              </div>

              {selectedDay.isFullDayAbsent ? (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800 flex items-center gap-1">
                  <AlertOctagon className="w-3.5 h-3.5" />
                  <span>Full-Day Absent</span>
                </span>
              ) : selectedDay.absentLectures > 0 ? (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Missed {selectedDay.absentLectures}</span>
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  100% Present
                </span>
              )}
            </div>

            <div className="p-5 max-h-[350px] overflow-y-auto space-y-2.5">
              {selectedDay.lectures.map((lec, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between p-3 rounded-xl border text-sm ${
                    lec.status === "P"
                      ? "border-emerald-200/60 bg-emerald-50/30 dark:border-emerald-900/30 dark:bg-emerald-950/10"
                      : "border-rose-200/60 bg-rose-50/30 dark:border-rose-900/30 dark:bg-rose-950/10"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg shadow-2xs ${
                        lec.status === "P"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300"
                          : "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300"
                      }`}
                    >
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
                        {lec.courseName}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mt-0.5">
                        <span>{lec.compName}</span>
                        {lec.time && (
                          <>
                            <span>•</span>
                            <Clock className="w-3 h-3" />
                            <span>{lec.time}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    {lec.status === "P" ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Present</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Absent</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex justify-end">
              <button
                onClick={() => setSelectedDay(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 transition-opacity"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

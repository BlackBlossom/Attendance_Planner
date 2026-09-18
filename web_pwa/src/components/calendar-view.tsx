"use client";

import React, { useState, useEffect } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  AlertOctagon,
  CheckCircle,
  XCircle,
  Clock,
  BookOpen,
  ListFilter,
  CalendarDays,
} from "lucide-react";
import { DayWiseStatus } from "@/lib/types";

interface CalendarViewProps {
  days: DayWiseStatus[];
}

export const CalendarView: React.FC<CalendarViewProps> = ({ days }) => {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<DayWiseStatus | null>(null);
  const [viewMode, setViewMode] = useState<"calendar" | "absentList">("calendar");

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
  let monthAttendedCount = 0;
  let monthTotalLectures = 0;

  for (let d = 1; d <= totalDaysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayData = dayMap[key];
    if (dayData) {
      if (dayData.isFullDayAbsent) monthFullDayAbsents++;
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

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>Attendance History & Calendar</span>
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Day-by-day attendance tracking. Full-day absent dates are explicitly highlighted.
          </p>
        </div>

        {/* View Switcher & Month Navigation */}
        <div className="flex items-center gap-2 self-start">
          <div className="inline-flex rounded-lg p-1 bg-zinc-100 dark:bg-zinc-800 text-xs font-medium mr-2">
            <button
              onClick={() => setViewMode("calendar")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all ${
                viewMode === "calendar"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Calendar</span>
            </button>
            <button
              onClick={() => setViewMode("absentList")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all ${
                viewMode === "absentList"
                  ? "bg-rose-500 text-white shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>Absent Days ({allFullDayAbsentDays.length})</span>
            </button>
          </div>

          {viewMode === "calendar" && (
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrevMonth}
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100 min-w-[110px] text-center">
                {monthNames[month]} {year}
              </span>
              <button
                onClick={handleNextMonth}
                className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Month Statistics Bar */}
      {viewMode === "calendar" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Month Total Classes</div>
            <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">{monthTotalLectures}</div>
          </div>
          <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Attended Lectures</div>
            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{monthAttendedCount}</div>
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
          <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <div className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Month Attendance %</div>
            <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
              {monthTotalLectures > 0 ? `${Math.round((monthAttendedCount / monthTotalLectures) * 100)}%` : "0%"}
            </div>
          </div>
        </div>
      )}

      {/* Main View: Calendar or Absent List */}
      {viewMode === "calendar" ? (
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
                      : ""
                  }`}
                >
                  {/* Date number & Badges */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                        isFullAbsent
                          ? "bg-rose-600 text-white shadow-xs"
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
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
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
        /* Absent Days List View */
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-800/40 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
              All Days Absent For The Whole Day
            </span>
            <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
              Total: {allFullDayAbsentDays.length} Days
            </span>
          </div>

          {allFullDayAbsentDays.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No full-day absences found! Great job maintaining your attendance.
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {allFullDayAbsentDays.map((day) => (
                <div
                  key={day.date}
                  onClick={() => setSelectedDay(day)}
                  className="p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-sm">
                      <AlertOctagon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                        {day.date}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Missed all {day.totalLectures} scheduled lectures ({day.lectures.map((l) => l.courseName).slice(0, 2).join(", ")}
                        {day.lectures.length > 2 ? ` +${day.lectures.length - 2} more` : ""})
                      </div>
                    </div>
                  </div>

                  <span className="px-3 py-1 rounded-lg text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                    View Lectures →
                  </span>
                </div>
              ))}
            </div>
          )}
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
                  <span>Attendance for {selectedDay.date}</span>
                </h3>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {selectedDay.presentLectures} of {selectedDay.totalLectures} lectures attended
                </div>
              </div>

              {selectedDay.isFullDayAbsent ? (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800 flex items-center gap-1">
                  <AlertOctagon className="w-3.5 h-3.5" />
                  <span>Full-Day Absent</span>
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  {Math.round((selectedDay.presentLectures / selectedDay.totalLectures) * 100)}% Attended
                </span>
              )}
            </div>

            <div className="p-5 max-h-[350px] overflow-y-auto space-y-2.5">
              {selectedDay.lectures.map((lec, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-white dark:bg-zinc-800 shadow-2xs">
                      <BookOpen className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
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

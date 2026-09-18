"use client";

import React, { useState, useMemo } from "react";
import {
  SlidersHorizontal,
  Download,
  Clock,
  MapPin,
  Sparkles,
  Calendar as CalendarIcon,
  Palmtree,
  CalendarOff,
  ArrowRight,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Layers,
  Check,
  X,
  CalendarDays,
  Flame,
  Filter,
  Eye,
  EyeOff,
  History,
  CheckCircle2,
} from "lucide-react";
import { ScheduleClassItem, AttendanceCourseItem, DayWiseStatus } from "@/lib/types";
import {
  calculateMetrics,
  evaluateBunkAdvice,
  calculateDaysToRecover,
  SubjectProjection,
  OverallProjection,
} from "@/lib/attendance-math";
import { generateICS } from "@/lib/ics";

interface SchedulePlannerProps {
  schedule: ScheduleClassItem[];
  courses: AttendanceCourseItem[];
  pastDays?: DayWiseStatus[];
  onExportICS: () => void;
  isLoading: boolean;
  onRangeChange?: (startDate: string, endDate: string) => void;
}

export const SchedulePlanner: React.FC<SchedulePlannerProps> = ({
  schedule,
  courses,
  pastDays = [],
  isLoading,
  onRangeChange,
}) => {
  // Target percentage (default 75%)
  const [targetPercent, setTargetPercent] = useState<number>(75);

  // Active view tab: "timetable" (checklist) vs "subjects" (deep dive impact)
  const [activeTab, setActiveTab] = useState<"timetable" | "subjects">("timetable");

  // Selected day filter in Day Strip: "all" or specific normalized date key (e.g. "2026-09-14")
  const [selectedDayKey, setSelectedDayKey] = useState<string>("all");

  // Date awareness: Hide classes that are completed or already marked present/absent
  const [hideCompletedAndMarked, setHideCompletedAndMarked] = useState<boolean>(true);

  // Date range state
  const [rangePreset, setRangePreset] = useState<"current" | "next" | "twoWeeks" | "month" | "custom">("current");
  const [showCustomDateModal, setShowCustomDateModal] = useState(false);

  const [customStart, setCustomStart] = useState<string>(() => {
    const now = new Date();
    const day = now.getDay();
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - day);
    return sunday.toISOString().split("T")[0];
  });

  const [customEnd, setCustomEnd] = useState<string>(() => {
    const now = new Date();
    const day = now.getDay();
    const saturday = new Date(now);
    saturday.setDate(now.getDate() + (6 - day));
    return saturday.toISOString().split("T")[0];
  });

  // Interactive plan state: class unique key -> boolean (true = attend, false = bunk)
  const [planMap, setPlanMap] = useState<{ [key: string]: boolean }>({});

  // Holiday dates state: Set of date keys (normalized YYYY-MM-DD)
  const [holidayDates, setHolidayDates] = useState<Set<string>>(new Set());

  // Helper to normalize any date string to YYYY-MM-DD for consistent key comparison
  const normalizeDate = (rawStr?: string): string => {
    if (!rawStr) return "";
    const datePart = rawStr.split(" ")[0].trim();
    if (datePart.includes("/")) {
      const [d, m, y] = datePart.split("/");
      if (d && m && y) return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    return datePart;
  };

  // Helper to parse class end date & time
  const parseClassEndDateTime = (item: ScheduleClassItem): Date | null => {
    const endStr = item.end || item.start;
    if (!endStr) return null;
    const str = endStr.trim();
    if (str.includes("/")) {
      const [dmy, time] = str.split(" ");
      const parts = dmy.split("/").map(Number);
      if (parts.length === 3) {
        const [d, m, y] = parts;
        let hh = 23, mm = 59, ss = 59;
        if (time) {
          const t = time.split(":").map(Number);
          hh = t[0] || 0;
          mm = t[1] || 0;
          ss = t[2] || 0;
        }
        return new Date(y, m - 1, d, hh, mm, ss);
      }
    }
    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  // Build index of lectures already marked P/A in pastDays history
  const markedAttendanceInHistory = useMemo(() => {
    const set = new Set<string>();
    pastDays.forEach((day) => {
      day.lectures.forEach((lec) => {
        if (lec.status === "P" || lec.status === "A") {
          // Key by date + lowercased course name snippet
          const cleanName = (lec.courseName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          set.add(`${day.date}_${cleanName}`);
        }
      });
    });
    return set;
  }, [pastDays]);

  // Determine if a class is in the past OR has attendance marked
  const getClassStatusMeta = (item: ScheduleClassItem) => {
    const now = new Date();
    const endDateTime = parseClassEndDateTime(item);
    const isCompleted = endDateTime !== null && endDateTime.getTime() <= now.getTime();

    // Check if ERP marked attendance on the item itself
    const anyItem = item as any;
    const isMarkedOnItem =
      anyItem.isAttendanceMarked === true ||
      anyItem.isAttendance === "P" ||
      anyItem.isAttendance === "A" ||
      anyItem.attendance === "PRESENT" ||
      anyItem.attendance === "ABSENT";

    // Check against history
    const dateKey = normalizeDate(item.start);
    const cleanCourse = (item.courseName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const isMarkedInHistory = markedAttendanceInHistory.has(`${dateKey}_${cleanCourse}`);

    const isMarked = isMarkedOnItem || isMarkedInHistory;
    return { isCompleted, isMarked, shouldExclude: isCompleted || isMarked };
  };

  // Filter schedule based on time-awareness
  const { activeUpcomingSchedule, completedOrMarkedCount } = useMemo(() => {
    let completedCount = 0;
    const active = schedule.filter((item) => {
      const { shouldExclude } = getClassStatusMeta(item);
      if (shouldExclude) {
        completedCount++;
        return !hideCompletedAndMarked; // Include only if user toggled "Show Past Classes"
      }
      return true;
    });

    return {
      activeUpcomingSchedule: active,
      completedOrMarkedCount: completedCount,
    };
  }, [schedule, hideCompletedAndMarked, markedAttendanceInHistory]);

  const getClassKey = (item: ScheduleClassItem, idx: number) => {
    return `${item.courseCode || "c"}_${item.start || idx}`;
  };

  const isHoliday = (item: ScheduleClassItem) => {
    const dateKey = normalizeDate(item.start);
    return holidayDates.has(dateKey);
  };

  const toggleHolidayForDate = (dateKey: string) => {
    setHolidayDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  };

  const isClassAttended = (item: ScheduleClassItem, idx: number) => {
    const key = getClassKey(item, idx);
    return planMap[key] !== undefined ? planMap[key] : true;
  };

  const setClassAttendance = (item: ScheduleClassItem, idx: number, attend: boolean) => {
    if (isHoliday(item)) return;
    const key = getClassKey(item, idx);
    setPlanMap((prev) => ({ ...prev, [key]: attend }));
  };

  const markAll = (attend: boolean) => {
    const updated: { [key: string]: boolean } = {};
    activeUpcomingSchedule.forEach((item, idx) => {
      if (!isHoliday(item)) {
        updated[getClassKey(item, idx)] = attend;
      }
    });
    setPlanMap(updated);
  };

  const markDay = (targetDateKey: string, attend: boolean) => {
    const updated = { ...planMap };
    activeUpcomingSchedule.forEach((item, idx) => {
      if (normalizeDate(item.start) === targetDateKey && !isHoliday(item)) {
        updated[getClassKey(item, idx)] = attend;
      }
    });
    setPlanMap(updated);
  };

  // Base metrics by course
  const courseBaseMap = useMemo(() => {
    const map = new Map<string, { present: number; total: number; name: string; code: string }>();
    courses.forEach((c) => {
      let p = 0;
      let t = 0;
      c.attendanceCourseComponentNameInfoList?.forEach((comp) => {
        p += comp.numberOfPresent || 0;
        t += comp.numberOfPeriods || 0;
      });
      map.set(c.courseCode, {
        present: p,
        total: t,
        name: c.courseName,
        code: c.courseCode,
      });
    });
    return map;
  }, [courses]);

  // Compute end-to-end subject-wise and overall projections (EXCLUDING HOLIDAYS & PAST/MARKED)
  const { subjectProjections, overallProjection, holidayClassesCount } = useMemo(() => {
    const plannedByCourse = new Map<string, { totalUpcoming: number; plannedAttended: number }>();
    let holidaysCount = 0;

    // We ONLY project genuinely future, unrecorded classes
    const classesToSimulate = activeUpcomingSchedule.filter((item) => {
      const { shouldExclude } = getClassStatusMeta(item);
      return !shouldExclude; // Never count completed or marked classes towards future additions
    });

    classesToSimulate.forEach((item, idx) => {
      if (isHoliday(item)) {
        holidaysCount += 1;
        return;
      }

      const code = item.courseCode || "OTHER";
      if (!plannedByCourse.has(code)) {
        plannedByCourse.set(code, { totalUpcoming: 0, plannedAttended: 0 });
      }
      const entry = plannedByCourse.get(code)!;
      entry.totalUpcoming += 1;
      if (isClassAttended(item, idx)) {
        entry.plannedAttended += 1;
      }
    });

    let overallCurP = 0;
    let overallCurT = 0;
    let overallProjP = 0;
    let overallProjT = 0;
    let totalUpcoming = 0;
    let totalAttended = 0;

    const subjects: SubjectProjection[] = [];

    courseBaseMap.forEach((base, code) => {
      const planned = plannedByCourse.get(code) || { totalUpcoming: 0, plannedAttended: 0 };
      const curP = base.present;
      const curT = base.total;
      const curPercent = curT > 0 ? (curP / curT) * 100 : 0;

      const projP = curP + planned.plannedAttended;
      const projT = curT + planned.totalUpcoming;
      const projPercent = projT > 0 ? (projP / projT) * 100 : curPercent;

      overallCurP += curP;
      overallCurT += curT;
      overallProjP += projP;
      overallProjT += projT;
      totalUpcoming += planned.totalUpcoming;
      totalAttended += planned.plannedAttended;

      const metrics = calculateMetrics(projP, projT, targetPercent);

      subjects.push({
        courseCode: code,
        courseName: base.name,
        currentPresent: curP,
        currentTotal: curT,
        currentPercentage: Math.round(curPercent * 10) / 10,
        plannedUpcoming: planned.totalUpcoming,
        plannedAttended: planned.plannedAttended,
        plannedBunked: planned.totalUpcoming - planned.plannedAttended,
        projectedPresent: projP,
        projectedTotal: projT,
        projectedPercentage: Math.round(projPercent * 10) / 10,
        percentageDelta: Math.round((projPercent - curPercent) * 10) / 10,
        safeBunks: metrics.safeBunks,
        classesNeeded: metrics.classesNeeded,
        status: metrics.status,
      });
    });

    const overallCurPercent = overallCurT > 0 ? (overallCurP / overallCurT) * 100 : 0;
    const overallProjPercent = overallProjT > 0 ? (overallProjP / overallProjT) * 100 : 0;
    const overallMetrics = calculateMetrics(overallProjP, overallProjT, targetPercent);
    const { daysNeeded } = calculateDaysToRecover(overallProjP, overallProjT, targetPercent);

    const overall: OverallProjection = {
      currentPresent: overallCurP,
      currentTotal: overallCurT,
      currentPercentage: Math.round(overallCurPercent * 10) / 10,
      projectedPresent: overallProjP,
      projectedTotal: overallProjT,
      projectedPercentage: Math.round(overallProjPercent * 10) / 10,
      percentageDelta: Math.round((overallProjPercent - overallCurPercent) * 10) / 10,
      totalUpcomingClasses: totalUpcoming,
      totalPlannedAttended: totalAttended,
      totalPlannedBunks: totalUpcoming - totalAttended,
      safeBunksAtTarget: overallMetrics.safeBunks,
      classesNeededAtTarget: overallMetrics.classesNeeded,
      daysToRecover: daysNeeded,
      targetPercentage: targetPercent,
      status: overallMetrics.status,
    };

    return {
      subjectProjections: subjects,
      overallProjection: overall,
      holidayClassesCount: holidaysCount,
    };
  }, [activeUpcomingSchedule, courseBaseMap, planMap, holidayDates, targetPercent, markedAttendanceInHistory]);

  // Group classes by Date
  const classesByDate = useMemo(() => {
    const groups: {
      [dateKey: string]: {
        dateKey: string;
        rawDate: string;
        dayName: string;
        shortDate: string;
        items: { item: ScheduleClassItem; idx: number }[];
      };
    } = {};

    activeUpcomingSchedule.forEach((item, idx) => {
      const dateKey = normalizeDate(item.start);
      if (!groups[dateKey]) {
        const rawDate = item.start?.split(" ")[0] || dateKey;
        let dayName = "";
        let shortDate = rawDate;
        try {
          const parts = rawDate.split("/");
          if (parts.length === 3) {
            const d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
            dayName = d.toLocaleDateString("en-US", { weekday: "short" });
            shortDate = `${parts[0]} ${d.toLocaleDateString("en-US", { month: "short" })}`;
          }
        } catch {
          dayName = "";
        }

        groups[dateKey] = {
          dateKey,
          rawDate,
          dayName: dayName || "Day",
          shortDate,
          items: [],
        };
      }
      groups[dateKey].items.push({ item, idx });
    });

    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [activeUpcomingSchedule]);

  // Smart Bunk Recommendations (only for upcoming classes)
  const smartBunkRecommendations = useMemo(() => {
    const list: (ScheduleClassItem & { advice: any; index: number })[] = [];
    activeUpcomingSchedule.forEach((item, idx) => {
      const { shouldExclude } = getClassStatusMeta(item);
      if (shouldExclude || isHoliday(item)) return;

      const code = item.courseCode;
      const base = courseBaseMap.get(code);
      if (base) {
        const advice = evaluateBunkAdvice(base.present, base.total, targetPercent, code, base.name);
        list.push({ ...item, advice, index: idx });
      }
    });
    return list;
  }, [activeUpcomingSchedule, courseBaseMap, holidayDates, targetPercent, markedAttendanceInHistory]);

  // Apply one-click "Optimal Bunk Strategy"
  const applyOptimalStrategy = () => {
    const updated = { ...planMap };
    activeUpcomingSchedule.forEach((item, idx) => {
      const { shouldExclude } = getClassStatusMeta(item);
      if (shouldExclude || isHoliday(item)) return;

      const code = item.courseCode;
      const base = courseBaseMap.get(code);
      if (base) {
        const advice = evaluateBunkAdvice(base.present, base.total, targetPercent, code, base.name);
        const shouldAttend = advice.bunkImpact !== "safe";
        updated[getClassKey(item, idx)] = shouldAttend;
      }
    });
    setPlanMap(updated);
  };

  // Date range handlers
  const handleApplyCustomRange = () => {
    if (!customStart || !customEnd) return;
    setRangePreset("custom");
    setShowCustomDateModal(false);
    onRangeChange?.(customStart, customEnd);
  };

  const handlePresetSelect = (preset: "current" | "next" | "twoWeeks" | "month") => {
    setRangePreset(preset);
    if (!onRangeChange) return;

    const now = new Date();
    const day = now.getDay();
    const currentSunday = new Date(now);
    currentSunday.setDate(now.getDate() - day);

    const fmt = (d: Date) => d.toISOString().split("T")[0];

    let start = "";
    let end = "";

    if (preset === "current") {
      const sat = new Date(currentSunday);
      sat.setDate(currentSunday.getDate() + 6);
      start = fmt(currentSunday);
      end = fmt(sat);
    } else if (preset === "next") {
      const nextSun = new Date(currentSunday);
      nextSun.setDate(currentSunday.getDate() + 7);
      const nextSat = new Date(nextSun);
      nextSat.setDate(nextSun.getDate() + 6);
      start = fmt(nextSun);
      end = fmt(nextSat);
    } else if (preset === "twoWeeks") {
      const sat = new Date(currentSunday);
      sat.setDate(currentSunday.getDate() + 13);
      start = fmt(currentSunday);
      end = fmt(sat);
    } else if (preset === "month") {
      const monthEnd = new Date(currentSunday);
      monthEnd.setDate(currentSunday.getDate() + 27);
      start = fmt(currentSunday);
      end = fmt(monthEnd);
    }

    setCustomStart(start);
    setCustomEnd(end);
    onRangeChange(start, end);
  };

  const handleExportICS = () => {
    const activeClasses = activeUpcomingSchedule.filter((c) => {
      const { shouldExclude } = getClassStatusMeta(c);
      return !shouldExclude && !isHoliday(c);
    });
    const icsContent = generateICS(activeClasses, `KIET Timetable (${targetPercent}% Goal)`);
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `timetable_${Date.now()}.ics`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Filtered date groups according to selected day strip
  const visibleDateGroups = useMemo(() => {
    if (selectedDayKey === "all") return classesByDate;
    return classesByDate.filter(([dateKey]) => dateKey === selectedDayKey);
  }, [classesByDate, selectedDayKey]);

  const isSafeProjected = overallProjection.projectedPercentage >= targetPercent;

  return (
    <div className="space-y-6">
      {/* 1. Sleek Simulator Bar */}
      <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          {/* Target Selector */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Target Goal
            </span>
            <div className="inline-flex rounded-xl p-1 bg-zinc-100 dark:bg-zinc-800 text-xs font-semibold">
              {[60, 70, 75, 80, 85].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setTargetPercent(preset)}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    targetPercent === preset
                      ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                  }`}
                >
                  {preset}%
                </button>
              ))}
            </div>

            {/* Date Range Selector */}
            <div className="inline-flex rounded-xl p-1 bg-zinc-100 dark:bg-zinc-800 text-xs font-medium">
              <button
                onClick={() => handlePresetSelect("current")}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  rangePreset === "current"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-bold"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                This Week
              </button>
              <button
                onClick={() => handlePresetSelect("next")}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  rangePreset === "next"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-bold"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                Next Week
              </button>
              <button
                onClick={() => handlePresetSelect("twoWeeks")}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  rangePreset === "twoWeeks"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-bold"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                2 Weeks
              </button>
              <button
                onClick={() => handlePresetSelect("month")}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  rangePreset === "month"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-bold"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                Month
              </button>
              <button
                onClick={() => setShowCustomDateModal(!showCustomDateModal)}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                  rangePreset === "custom"
                    ? "bg-indigo-600 text-white shadow-xs font-bold"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900"
                }`}
              >
                <CalendarIcon className="w-3 h-3" />
                <span>Custom</span>
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={applyOptimalStrategy}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-sm shadow-indigo-500/20 hover:opacity-95 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Auto-Optimize Bunks</span>
            </button>

            <button
              onClick={handleExportICS}
              disabled={activeUpcomingSchedule.length === 0}
              className="p-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-2xs disabled:opacity-40"
              title="Export Upcoming Timetable (.ics)"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Custom Date Inputs Dropdown */}
        {showCustomDateModal && (
          <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center gap-3 text-xs animate-in fade-in duration-200">
            <span className="font-semibold text-zinc-600 dark:text-zinc-300">Choose Custom Date Range:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs focus:ring-1 focus:ring-indigo-500"
            />
            <ArrowRight className="w-3 h-3 text-zinc-400" />
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs focus:ring-1 focus:ring-indigo-500"
            />
            <button
              onClick={handleApplyCustomRange}
              disabled={isLoading}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors disabled:opacity-50"
            >
              {isLoading ? "Loading..." : "Apply Range"}
            </button>
          </div>
        )}

        {/* Date Awareness Filter Indicator */}
        <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
            <History className="w-3.5 h-3.5 text-indigo-500" />
            <span>
              <strong>Time-Aware Filter:</strong> Showing only genuinely upcoming, unrecorded lectures.
              {completedOrMarkedCount > 0 && ` (${completedOrMarkedCount} past / recorded lectures omitted)`}
            </span>
          </div>

          <button
            onClick={() => setHideCompletedAndMarked(!hideCompletedAndMarked)}
            className="inline-flex items-center gap-1 font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            {hideCompletedAndMarked ? (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span>Show Completed Classes</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                <span>Hide Completed Classes</span>
              </>
            )}
          </button>
        </div>

        {/* Live Simulation Metric Strip */}
        <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 grid grid-cols-2 sm:grid-cols-4 gap-4 items-center">
          {/* Current -> Projected Score */}
          <div>
            <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Projected Attendance
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-zinc-100">
                {overallProjection.projectedPercentage}%
              </span>
              <span
                className={`text-xs font-bold ${
                  overallProjection.percentageDelta >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {overallProjection.percentageDelta >= 0
                  ? `+${overallProjection.percentageDelta}%`
                  : `${overallProjection.percentageDelta}%`}
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              From {overallProjection.currentPercentage}% current
            </div>
          </div>

          {/* Goal Verdict */}
          <div>
            <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              {targetPercent}% Target Status
            </div>
            <div className="mt-0.5">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                  isSafeProjected
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                    : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-800"
                }`}
              >
                {isSafeProjected ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                <span>
                  {isSafeProjected
                    ? `${overallProjection.safeBunksAtTarget} Bunks Safe`
                    : `Need ${overallProjection.classesNeededAtTarget} Classes`}
                </span>
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">
              {isSafeProjected ? "Above target threshold" : "Below required attendance"}
            </div>
          </div>

          {/* Classes Breakdown */}
          <div>
            <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Upcoming Classes
            </div>
            <div className="text-sm font-bold text-zinc-800 dark:text-zinc-200 mt-1 flex items-center gap-2">
              <span className="text-emerald-600">{overallProjection.totalPlannedAttended} Attending</span>
              <span>•</span>
              <span className="text-rose-600">{overallProjection.totalPlannedBunks} Bunked</span>
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              {holidayClassesCount > 0 ? `${holidayClassesCount} holiday classes omitted` : "Genuinely future unrecorded"}
            </div>
          </div>

          {/* Streak Recovery */}
          <div>
            <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Attendance Recovery
            </div>
            <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400 mt-1 flex items-center gap-1">
              <Flame className="w-4 h-4 text-amber-500" />
              <span>
                {isSafeProjected ? "On Track!" : `~${overallProjection.daysToRecover} Days Streak`}
              </span>
            </div>
            <div className="text-[11px] text-zinc-400 mt-0.5">
              {isSafeProjected ? "100% compliant with goal" : "Go to class regularly to hit goal"}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Planner Mode Tabs */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("timetable")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "timetable"
                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            <span>Interactive Timetable Checklist</span>
          </button>

          <button
            onClick={() => setActiveTab("subjects")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "subjects"
                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Subject Projections ({subjectProjections.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold">
          <button
            onClick={() => markAll(true)}
            className="text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            Attend All
          </button>
          <span className="text-zinc-300 dark:text-zinc-700">•</span>
          <button
            onClick={() => markAll(false)}
            className="text-rose-600 dark:text-rose-400 hover:underline"
          >
            Bunk All
          </button>
        </div>
      </div>

      {/* 3. TAB A: Sophisticated Timetable Checklist */}
      {activeTab === "timetable" && (
        <div className="space-y-5">
          {/* Day Strip (Horizontal Weekday Selector) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedDayKey("all")}
              className={`px-3 py-2 rounded-xl text-xs font-semibold shrink-0 transition-all ${
                selectedDayKey === "all"
                  ? "bg-indigo-600 text-white shadow-xs font-bold"
                  : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-indigo-300"
              }`}
            >
              All Days ({classesByDate.length})
            </button>

            {classesByDate.map(([dateKey, group]) => {
              const isSelected = selectedDayKey === dateKey;
              const isDayHoliday = holidayDates.has(dateKey);
              let attendedCount = 0;
              group.items.forEach(({ item, idx }) => {
                if (isClassAttended(item, idx)) attendedCount++;
              });

              return (
                <button
                  key={dateKey}
                  onClick={() => setSelectedDayKey(dateKey)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-medium shrink-0 transition-all flex items-center gap-2 ${
                    isSelected
                      ? "bg-indigo-600 text-white shadow-xs font-bold"
                      : isDayHoliday
                      ? "bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-purple-800 dark:text-purple-300"
                      : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300"
                  }`}
                >
                  <div>
                    <span className="font-bold uppercase tracking-wider text-[10px] block opacity-80">
                      {group.dayName}
                    </span>
                    <span className="text-xs font-semibold">{group.shortDate}</span>
                  </div>

                  {isDayHoliday ? (
                    <Palmtree className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                  ) : (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        isSelected
                          ? "bg-indigo-700/60 text-white"
                          : attendedCount === group.items.length
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300"
                          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {attendedCount}/{group.items.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Classes List or All-Completed Fallback */}
          {visibleDateGroups.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 mx-auto flex items-center justify-center mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                All classes for this period are completed or already marked!
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto mt-1">
                There are no upcoming, unrecorded classes remaining in this date range. Jump to next week to simulate future attendance.
              </p>
              <div className="mt-4 flex items-center justify-center gap-3">
                <button
                  onClick={() => handlePresetSelect("next")}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all"
                >
                  Plan Next Week →
                </button>
                <button
                  onClick={() => setHideCompletedAndMarked(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
                >
                  Show Past Classes Anyway
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {visibleDateGroups.map(([dateKey, group]) => {
                const isDayHoliday = holidayDates.has(dateKey);

                return (
                  <div
                    key={dateKey}
                    className={`rounded-2xl border transition-all overflow-hidden shadow-2xs ${
                      isDayHoliday
                        ? "border-purple-200/80 dark:border-purple-900/40 bg-purple-50/20 dark:bg-purple-950/10"
                        : "border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                    }`}
                  >
                    {/* Modern Date Header Card */}
                    <div
                      className={`px-4 py-3 border-b flex flex-wrap items-center justify-between gap-3 text-xs ${
                        isDayHoliday
                          ? "bg-purple-50/80 dark:bg-purple-950/30 border-purple-200 dark:border-purple-900/40 text-purple-900 dark:text-purple-200"
                          : "bg-zinc-50/80 dark:bg-zinc-800/40 border-zinc-100 dark:border-zinc-800"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                            isDayHoliday
                              ? "bg-purple-200 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                              : "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200"
                          }`}
                        >
                          {group.dayName.slice(0, 2)}
                        </div>
                        <div>
                          <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                            {group.rawDate}
                          </span>
                          <span className="text-zinc-400 ml-2 font-normal">
                            ({group.items.length} lectures)
                          </span>
                        </div>
                      </div>

                      {/* Day Action Buttons */}
                      <div className="flex items-center gap-2">
                        {/* Holiday Toggle Button */}
                        <button
                          onClick={() => toggleHolidayForDate(dateKey)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                            isDayHoliday
                              ? "bg-purple-600 text-white hover:bg-purple-700 shadow-2xs"
                              : "bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-purple-300"
                          }`}
                        >
                          <Palmtree className="w-3.5 h-3.5" />
                          <span>{isDayHoliday ? "Holiday Enabled" : "Mark Holiday"}</span>
                        </button>

                        {!isDayHoliday && (
                          <div className="flex items-center gap-1.5 pl-2 border-l border-zinc-200 dark:border-zinc-700 text-[11px] font-semibold">
                            <button
                              onClick={() => markDay(dateKey, true)}
                              className="px-2 py-0.5 rounded text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                            >
                              Attend Day
                            </button>
                            <button
                              onClick={() => markDay(dateKey, false)}
                              className="px-2 py-0.5 rounded text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            >
                              Bunk Day
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Holiday Notification Message */}
                    {isDayHoliday && (
                      <div className="px-4 py-2 bg-purple-50/60 dark:bg-purple-950/30 text-xs text-purple-800 dark:text-purple-300 flex items-center gap-2 border-b border-purple-100 dark:border-purple-900/30">
                        <Palmtree className="w-4 h-4 text-purple-600 shrink-0" />
                        <span>
                          <strong>Declared Holiday:</strong> All {group.items.length} lectures on this date are excluded from calculations and won&apos;t affect your percentage.
                        </span>
                      </div>
                    )}

                    {/* Classes Modern Grid / Cards */}
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                      {group.items.map(({ item, idx }) => {
                        const { isCompleted, isMarked, shouldExclude } = getClassStatusMeta(item);
                        const attended = isClassAttended(item, idx);
                        const advice = smartBunkRecommendations.find(
                          (r) => r.courseCode === item.courseCode && r.start === item.start
                        )?.advice;

                        return (
                          <div
                            key={idx}
                            className={`p-3.5 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                              shouldExclude
                                ? "opacity-60 bg-zinc-50/50 dark:bg-zinc-900/40"
                                : isDayHoliday
                                ? "opacity-50 bg-zinc-50/30 dark:bg-zinc-900/20"
                                : attended
                                ? "hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40"
                                : "bg-rose-50/20 dark:bg-rose-950/10 hover:bg-rose-50/40"
                            }`}
                          >
                            {/* Left: Time badge & Subject Info */}
                            <div className="flex items-start gap-3">
                              {/* Time Chip */}
                              <div className="shrink-0 w-24 p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 text-center text-[11px] font-mono font-semibold text-zinc-700 dark:text-zinc-300">
                                {item.start?.split(" ")[1]?.slice(0, 5)} - {item.end?.split(" ")[1]?.slice(0, 5)}
                              </div>

                              <div>
                                <div className="flex items-center gap-2">
                                  <h4
                                    className={`text-sm font-bold leading-tight ${
                                      !attended && !isDayHoliday && !shouldExclude
                                        ? "text-rose-950 dark:text-rose-200 line-through decoration-rose-400"
                                        : "text-zinc-900 dark:text-zinc-100"
                                    }`}
                                  >
                                    {item.courseName}
                                  </h4>

                                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-semibold">
                                    {item.courseCompName || "CLASS"}
                                  </span>

                                  {/* Past/Marked pill */}
                                  {shouldExclude && (
                                    <span className="inline-flex items-center px-2 py-0.2 rounded-full text-[10px] font-bold bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                                      {isMarked ? "Attendance Recorded" : "Finished"}
                                    </span>
                                  )}

                                  {/* Smart Bunk Pill */}
                                  {!isDayHoliday && !shouldExclude && advice && (
                                    <span
                                      className={`hidden md:inline-flex items-center px-2 py-0.2 rounded-full text-[10px] font-bold ${
                                        advice.bunkImpact === "safe"
                                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-900/60"
                                          : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200/60 dark:border-rose-900/60"
                                      }`}
                                    >
                                      {advice.bunkImpact === "safe" ? "Safe to Skip" : "Must Attend"}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                  {item.content && (
                                    <span className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3 text-zinc-400" />
                                      <span>{item.content}</span>
                                    </span>
                                  )}
                                  {item.facultyName && (
                                    <>
                                      <span>•</span>
                                      <span>{item.facultyName}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right: Segmented Switch for Attend / Bunk */}
                            <div className="flex items-center gap-2 self-end sm:self-center">
                              {isDayHoliday ? (
                                <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 px-3 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800">
                                  Holiday (0 periods)
                                </span>
                              ) : shouldExclude ? (
                                <span className="text-xs font-semibold text-zinc-500 px-3 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                                  Already Counted
                                </span>
                              ) : (
                                <div className="inline-flex rounded-xl p-0.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/60">
                                  <button
                                    type="button"
                                    onClick={() => setClassAttendance(item, idx, true)}
                                    className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                      attended
                                        ? "bg-emerald-600 text-white shadow-2xs"
                                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900"
                                    }`}
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Attend</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setClassAttendance(item, idx, false)}
                                    className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                      !attended
                                        ? "bg-rose-600 text-white shadow-2xs"
                                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900"
                                    }`}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    <span>Bunk</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. TAB B: Subject Impact Breakdown */}
      {activeTab === "subjects" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40 flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                Simulated Impact by Course ({targetPercent}% Target)
              </span>
              <span className="text-xs text-zinc-500">
                {subjectProjections.length} Courses
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/20 text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-semibold border-b border-zinc-100 dark:border-zinc-800">
                  <tr>
                    <th className="py-3 px-4">Subject</th>
                    <th className="py-3 px-4">Current %</th>
                    <th className="py-3 px-4">Simulated Bunks</th>
                    <th className="py-3 px-4">Projected %</th>
                    <th className="py-3 px-4">Net Change</th>
                    <th className="py-3 px-4">Margin at {targetPercent}%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {subjectProjections.map((sub) => {
                    const isSafe = sub.projectedPercentage >= targetPercent;
                    return (
                      <tr key={sub.courseCode} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-zinc-900 dark:text-zinc-100">
                            {sub.courseName}
                          </div>
                          <span className="font-mono text-[10px] text-zinc-400">
                            {sub.courseCode}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-zinc-700 dark:text-zinc-300">
                          {sub.currentPercentage}%
                          <div className="text-[10px] text-zinc-400 font-normal">
                            ({sub.currentPresent}/{sub.currentTotal})
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {sub.plannedBunked > 0 ? (
                            <span className="font-bold text-rose-600 dark:text-rose-400">
                              {sub.plannedBunked} bunks
                            </span>
                          ) : (
                            <span className="text-zinc-400">0</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                          {sub.projectedPercentage}%
                          <div className="text-[10px] text-zinc-400 font-normal">
                            ({sub.projectedPresent}/{sub.projectedTotal})
                          </div>
                        </td>
                        <td className="py-3 px-4 font-semibold">
                          <span
                            className={
                              sub.percentageDelta >= 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                            }
                          >
                            {sub.percentageDelta >= 0 ? `+${sub.percentageDelta}%` : `${sub.percentageDelta}%`}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${
                              isSafe
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                                : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400"
                            }`}
                          >
                            {isSafe
                              ? `${sub.safeBunks} safe bunks`
                              : `Need ${sub.classesNeeded} classes`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

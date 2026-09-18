"use client";

import React, { useState, useMemo } from "react";
import {
  SlidersHorizontal,
  Download,
  CheckSquare,
  Square,
  Clock,
  MapPin,
  Sparkles,
  Layers,
  Zap,
  TrendingUp,
  Filter,
  Calendar as CalendarIcon,
  Sun,
  Palmtree,
  CalendarOff,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { ScheduleClassItem, AttendanceCourseItem } from "@/lib/types";
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
  onExportICS: () => void;
  isLoading: boolean;
  onRangeChange?: (startDate: string, endDate: string) => void;
}

export const SchedulePlanner: React.FC<SchedulePlannerProps> = ({
  schedule,
  courses,
  isLoading,
  onRangeChange,
}) => {
  // Target percentage (default 75%)
  const [targetPercent, setTargetPercent] = useState<number>(75);

  // Custom Date Range State
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

  const [rangePreset, setRangePreset] = useState<"current" | "next" | "twoWeeks" | "month" | "custom">("current");

  // Subject and Day Filter
  const [selectedCourseFilter, setSelectedCourseFilter] = useState<string>("all");

  // Interactive plan state: class unique key -> boolean (true = attend, false = bunk)
  const [planMap, setPlanMap] = useState<{ [key: string]: boolean }>({});

  // Holiday dates state: Set of date keys (normalized YYYY-MM-DD or DD/MM/YYYY)
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

  const toggleClass = (item: ScheduleClassItem, idx: number) => {
    if (isHoliday(item)) return; // Holidays are non-interactive
    const key = getClassKey(item, idx);
    const currentVal = isClassAttended(item, idx);
    setPlanMap((prev) => ({ ...prev, [key]: !currentVal }));
  };

  const markAll = (attend: boolean) => {
    const updated: { [key: string]: boolean } = {};
    schedule.forEach((item, idx) => {
      if (!isHoliday(item)) {
        updated[getClassKey(item, idx)] = attend;
      }
    });
    setPlanMap(updated);
  };

  const markDay = (targetDateKey: string, attend: boolean) => {
    const updated = { ...planMap };
    schedule.forEach((item, idx) => {
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

  // Compute end-to-end subject-wise and overall projections (EXCLUDING HOLIDAYS)
  const { subjectProjections, overallProjection, holidayClassesCount } = useMemo(() => {
    const plannedByCourse = new Map<string, { totalUpcoming: number; plannedAttended: number }>();
    let holidaysCount = 0;

    schedule.forEach((item, idx) => {
      // If day is marked as Holiday, skip completely from attendance math!
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
  }, [schedule, courseBaseMap, planMap, holidayDates, targetPercent]);

  // Group classes by Date for clean UI
  const classesByDate = useMemo(() => {
    const groups: { [dateKey: string]: { rawDate: string; items: { item: ScheduleClassItem; idx: number }[] } } = {};

    schedule.forEach((item, idx) => {
      const dateKey = normalizeDate(item.start);
      if (!groups[dateKey]) {
        groups[dateKey] = {
          rawDate: item.start?.split(" ")[0] || dateKey,
          items: [],
        };
      }
      groups[dateKey].items.push({ item, idx });
    });

    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [schedule]);

  // Smart Bunk Advisor list
  const smartBunkRecommendations = useMemo(() => {
    const list: (ScheduleClassItem & { advice: any; index: number })[] = [];
    schedule.forEach((item, idx) => {
      if (isHoliday(item)) return; // Holidays don't need bunk advice
      const code = item.courseCode;
      const base = courseBaseMap.get(code);
      if (base) {
        const advice = evaluateBunkAdvice(base.present, base.total, targetPercent, code, base.name);
        list.push({ ...item, advice, index: idx });
      }
    });
    return list;
  }, [schedule, courseBaseMap, holidayDates, targetPercent]);

  // Optimal Bunk Strategy
  const applyOptimalStrategy = () => {
    const updated = { ...planMap };
    schedule.forEach((item, idx) => {
      if (isHoliday(item)) return;
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
    // Only export non-holiday classes
    const activeClasses = schedule.filter((c) => !isHoliday(c));
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

  return (
    <div className="space-y-6">
      {/* Top Banner & Target Slider */}
      <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Target Title */}
          <div className="max-w-xl">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                <SlidersHorizontal className="w-4 h-4" />
              </span>
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                Attendance Planner & Bunk Simulator
              </h2>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
              Select your timetable date range, mark official holidays (so they won&apos;t count), adjust your target percentage, and plan which classes you can safely miss.
            </p>
          </div>

          {/* Target Percentage Control */}
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/60 min-w-[280px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                Target Threshold
              </span>
              <span className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400">
                {targetPercent}%
              </span>
            </div>

            <input
              type="range"
              min={50}
              max={95}
              step={1}
              value={targetPercent}
              onChange={(e) => setTargetPercent(Number(e.target.value))}
              className="w-full h-2 mt-3 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />

            <div className="flex items-center justify-between gap-1 mt-2.5">
              {[60, 70, 75, 80, 85].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setTargetPercent(preset)}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                    targetPercent === preset
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700"
                  }`}
                >
                  {preset}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Date Selector & Presets */}
        <div className="mt-6 pt-5 border-t border-zinc-100 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mr-1 flex items-center gap-1">
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Range:</span>
            </span>
            <div className="inline-flex rounded-lg p-1 bg-zinc-100 dark:bg-zinc-800 text-xs font-medium">
              <button
                onClick={() => handlePresetSelect("current")}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  rangePreset === "current"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-bold"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                This Week
              </button>
              <button
                onClick={() => handlePresetSelect("next")}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  rangePreset === "next"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-bold"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                Next Week
              </button>
              <button
                onClick={() => handlePresetSelect("twoWeeks")}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  rangePreset === "twoWeeks"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-bold"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                2 Weeks
              </button>
              <button
                onClick={() => handlePresetSelect("month")}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  rangePreset === "month"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-bold"
                    : "text-zinc-600 dark:text-zinc-400"
                }`}
              >
                Month
              </button>
            </div>
          </div>

          {/* Custom Date Inputs */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-zinc-400">Custom:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs"
            />
            <ArrowRight className="w-3 h-3 text-zinc-400" />
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs"
            />
            <button
              onClick={handleApplyCustomRange}
              disabled={isLoading}
              className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors disabled:opacity-50 flex items-center gap-1 shadow-2xs"
            >
              {isLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <span>Load</span>}
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Projected Overall */}
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              Projected Overall
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                overallProjection.projectedPercentage >= targetPercent
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                  : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400"
              }`}
            >
              {overallProjection.percentageDelta >= 0
                ? `+${overallProjection.percentageDelta}%`
                : `${overallProjection.percentageDelta}%`}
            </span>
          </div>
          <div className="mt-2">
            <div className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-100">
              {overallProjection.projectedPercentage}%
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Currently {overallProjection.currentPercentage}% ({overallProjection.projectedPresent}/{overallProjection.projectedTotal} classes)
            </div>
          </div>
        </div>

        {/* Planned Breakdown */}
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            Simulated Classes
          </span>
          <div className="mt-2">
            <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {overallProjection.totalPlannedAttended} Attending
            </div>
            <div className="text-xs font-semibold text-rose-600 dark:text-rose-400 mt-0.5">
              {overallProjection.totalPlannedBunks} Planned Bunks
            </div>
            {holidayClassesCount > 0 && (
              <div className="text-xs font-medium text-purple-600 dark:text-purple-400 mt-0.5 flex items-center gap-1">
                <Palmtree className="w-3 h-3" />
                <span>{holidayClassesCount} holiday classes omitted</span>
              </div>
            )}
          </div>
        </div>

        {/* Target Buffer */}
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            {targetPercent}% Margin Buffer
          </span>
          <div className="mt-2">
            <div
              className={`text-2xl font-bold ${
                overallProjection.projectedPercentage >= targetPercent
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {overallProjection.projectedPercentage >= targetPercent
                ? `${overallProjection.safeBunksAtTarget} Safe Bunks`
                : `${overallProjection.classesNeededAtTarget} Classes Needed`}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              {overallProjection.projectedPercentage >= targetPercent
                ? `Buffer left without dropping below ${targetPercent}%`
                : `Consecutive classes to reach ${targetPercent}%`}
            </div>
          </div>
        </div>

        {/* Regular Recovery */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/10 flex flex-col justify-between">
          <div className="flex items-center gap-1 text-xs font-semibold text-indigo-100 uppercase tracking-wider">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Regular Recovery</span>
          </div>
          <div className="mt-2">
            <div className="text-3xl font-black">
              {overallProjection.projectedPercentage >= targetPercent
                ? "Safe!"
                : `~${overallProjection.daysToRecover} Days`}
            </div>
            <div className="text-xs text-indigo-100 mt-1">
              {overallProjection.projectedPercentage >= targetPercent
                ? `You meet your ${targetPercent}% goal comfortably.`
                : `Attend every class for ~${overallProjection.daysToRecover} days to restore ${targetPercent}%.`}
            </div>
          </div>
        </div>
      </div>

      {/* Smart Bunk Advisor & Actions */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Smart Bunk Advisor
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Algorithmic recommendation: skip high-buffer subjects and strictly protect borderline ones.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={applyOptimalStrategy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition-colors shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              <span>Apply Optimal Bunk Strategy</span>
            </button>

            <button
              onClick={handleExportICS}
              disabled={schedule.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-2xs disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export .ics</span>
            </button>
          </div>
        </div>

        {/* Top 3 Bunk Recommendations */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
          {smartBunkRecommendations.slice(0, 3).map((item, i) => {
            const isSafe = item.advice.bunkImpact === "safe";
            return (
              <div
                key={i}
                className={`p-3 rounded-xl border text-xs flex flex-col justify-between ${
                  isSafe
                    ? "bg-emerald-50/40 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/40"
                    : "bg-rose-50/40 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/40"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-900 dark:text-zinc-100 line-clamp-1">
                      {item.courseName}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        isSafe
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300"
                          : "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300"
                      }`}
                    >
                      {isSafe ? "Safe Bunk" : "Must Attend"}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                    {item.start?.split(" ")[0]} • {item.start?.split(" ")[1]?.slice(0, 5)}
                  </div>
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-300 mt-1.5 leading-snug">
                    {item.advice.adviceMessage}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Subject-Wise Projected Impact Table */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
              Subject-Wise Projection Breakdown ({targetPercent}% Target)
            </h3>
          </div>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {subjectProjections.length} Courses Tracked
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-800/20 text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-semibold border-b border-zinc-100 dark:border-zinc-800">
              <tr>
                <th className="py-3 px-4">Subject</th>
                <th className="py-3 px-4">Current %</th>
                <th className="py-3 px-4">Planned Bunks</th>
                <th className="py-3 px-4">Projected %</th>
                <th className="py-3 px-4">Delta</th>
                <th className="py-3 px-4">Buffer / Deficit at {targetPercent}%</th>
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
                          {sub.plannedBunked} classes
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

      {/* Date-Grouped Class Checklist with Holiday Controls */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-xs space-y-4">
        {/* Header & Global Bulk Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Timetable Checklist & Holiday Manager</span>
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Mark official college holidays so they don&apos;t count. Uncheck individual classes to simulate bunks.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => markAll(true)}
              className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold hover:bg-emerald-100 transition-colors"
            >
              Attend All
            </button>
            <button
              onClick={() => markAll(false)}
              className="px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-semibold hover:bg-rose-100 transition-colors"
            >
              Bunk All
            </button>
          </div>
        </div>

        {/* Classes Grouped by Date */}
        {classesByDate.length === 0 ? (
          <div className="p-12 text-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-zinc-500 text-xs">
            No schedule classes found for this date range. Try selecting another week or custom range above.
          </div>
        ) : (
          <div className="space-y-6">
            {classesByDate.map(([dateKey, group]) => {
              const isDayHoliday = holidayDates.has(dateKey);
              const dayClasses = group.items.filter(({ item }) =>
                selectedCourseFilter === "all" ? true : item.courseCode === selectedCourseFilter
              );

              if (dayClasses.length === 0) return null;

              return (
                <div
                  key={dateKey}
                  className={`rounded-xl border transition-all overflow-hidden ${
                    isDayHoliday
                      ? "border-purple-200 dark:border-purple-900/50 bg-purple-50/20 dark:bg-purple-950/10"
                      : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                  }`}
                >
                  {/* Date Header & Holiday Action Bar */}
                  <div
                    className={`p-3 border-b flex flex-wrap items-center justify-between gap-3 text-xs ${
                      isDayHoliday
                        ? "bg-purple-50/80 dark:bg-purple-950/30 border-purple-200 dark:border-purple-900/40 text-purple-900 dark:text-purple-200"
                        : "bg-zinc-50/80 dark:bg-zinc-800/40 border-zinc-100 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                        {group.rawDate}
                      </span>
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        ({dayClasses.length} {dayClasses.length === 1 ? "class" : "classes"})
                      </span>
                      {isDayHoliday && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300">
                          <Palmtree className="w-3 h-3" />
                          <span>College Holiday</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Holiday Toggle Button */}
                      <button
                        onClick={() => toggleHolidayForDate(dateKey)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                          isDayHoliday
                            ? "bg-purple-600 text-white shadow-2xs hover:bg-purple-700"
                            : "bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-purple-300"
                        }`}
                      >
                        <Palmtree className="w-3 h-3" />
                        <span>{isDayHoliday ? "Remove Holiday" : "Mark as Holiday"}</span>
                      </button>

                      {/* Day Bunk / Attend Actions if not holiday */}
                      {!isDayHoliday && (
                        <>
                          <button
                            onClick={() => markDay(dateKey, true)}
                            className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
                          >
                            Attend Day
                          </button>
                          <span>•</span>
                          <button
                            onClick={() => markDay(dateKey, false)}
                            className="text-[11px] text-rose-600 dark:text-rose-400 hover:underline font-semibold"
                          >
                            Bunk Day
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Holiday Message Banner */}
                  {isDayHoliday && (
                    <div className="px-4 py-2 bg-purple-50/60 dark:bg-purple-950/20 text-xs text-purple-700 dark:text-purple-300 flex items-center gap-1.5 border-b border-purple-100 dark:border-purple-900/30">
                      <Palmtree className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Classes on this day are marked as a holiday and <strong>will not count towards your total or attended lectures</strong>.
                      </span>
                    </div>
                  )}

                  {/* Classes List */}
                  <div className="p-3 space-y-2">
                    {dayClasses.map(({ item, idx }) => {
                      const attended = isClassAttended(item, idx);
                      const advice = smartBunkRecommendations.find(
                        (r) => r.courseCode === item.courseCode && r.start === item.start
                      )?.advice;

                      return (
                        <div
                          key={idx}
                          onClick={() => toggleClass(item, idx)}
                          className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                            isDayHoliday
                              ? "bg-zinc-50/40 dark:bg-zinc-800/20 border-zinc-200/40 dark:border-zinc-800/40 opacity-50 cursor-not-allowed"
                              : attended
                              ? "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-indigo-400 cursor-pointer"
                              : "bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200/60 dark:border-zinc-800/60 opacity-60 line-through decoration-zinc-400 cursor-pointer"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              disabled={isDayHoliday}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleClass(item, idx);
                              }}
                              className={`p-1 rounded-md transition-colors ${
                                isDayHoliday
                                  ? "text-zinc-300 dark:text-zinc-600"
                                  : attended
                                  ? "text-indigo-600 dark:text-indigo-400"
                                  : "text-zinc-400 dark:text-zinc-600"
                              }`}
                            >
                              {isDayHoliday ? (
                                <CalendarOff className="w-4 h-4 text-purple-400" />
                              ) : attended ? (
                                <CheckSquare className="w-4 h-4" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>

                            <div>
                              <div className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                                <span>{item.courseName}</span>
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                                  {item.courseCompName || "Class"}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-indigo-500" />
                                  <span>
                                    {item.start?.split(" ")[1]?.slice(0, 5)} - {item.end?.split(" ")[1]?.slice(0, 5)}
                                  </span>
                                </span>
                                {item.content && (
                                  <>
                                    <span>•</span>
                                    <span className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3 text-zinc-400" />
                                      <span>{item.content}</span>
                                    </span>
                                  </>
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

                          <div className="flex items-center gap-2 shrink-0">
                            {isDayHoliday ? (
                              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300">
                                Holiday (0 periods)
                              </span>
                            ) : (
                              <>
                                {advice && (
                                  <span
                                    className={`hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                                      advice.bunkImpact === "safe"
                                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                                        : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400"
                                    }`}
                                  >
                                    {advice.bunkImpact === "safe" ? "Safe Bunk" : "Must Attend"}
                                  </span>
                                )}

                                <span
                                  className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                                    attended
                                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                      : "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                                  }`}
                                >
                                  {attended ? "Attending" : "Bunked"}
                                </span>
                              </>
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
    </div>
  );
};

"use client";

import React, { useState } from "react";
import { BookOpen, UserCheck, Layers, ChevronDown, ChevronUp } from "lucide-react";
import { AttendanceCourseItem } from "@/lib/types";
import { calculateMetrics } from "@/lib/attendance-math";

interface SubjectCardsProps {
  courses: AttendanceCourseItem[];
}

export const SubjectCards: React.FC<SubjectCardsProps> = ({ courses }) => {
  const [filter, setFilter] = useState<"all" | "danger" | "safe">("all");

  const coursesWithMetrics = courses.map((course) => {
    let totalPresent = 0;
    let totalPeriods = 0;
    course.attendanceCourseComponentNameInfoList.forEach((comp) => {
      totalPresent += comp.numberOfPresent || 0;
      totalPeriods += comp.numberOfPeriods || 0;
    });

    const metrics = calculateMetrics(totalPresent, totalPeriods);
    return {
      ...course,
      totalPresent,
      totalPeriods,
      metrics,
    };
  });

  const filteredCourses = coursesWithMetrics.filter((c) => {
    if (filter === "danger") return c.metrics.percentage < 75;
    if (filter === "safe") return c.metrics.percentage >= 75;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>Course-wise Breakdown</span>
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Monitor theory and lab components to keep each subject above 75%.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="inline-flex rounded-lg p-1 bg-zinc-100 dark:bg-zinc-800 text-xs font-medium self-start">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 rounded-md transition-all ${
              filter === "all"
                ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            All ({coursesWithMetrics.length})
          </button>
          <button
            onClick={() => setFilter("danger")}
            className={`px-3 py-1 rounded-md transition-all ${
              filter === "danger"
                ? "bg-rose-500 text-white shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            Below 75% ({coursesWithMetrics.filter((c) => c.metrics.percentage < 75).length})
          </button>
          <button
            onClick={() => setFilter("safe")}
            className={`px-3 py-1 rounded-md transition-all ${
              filter === "safe"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
            }`}
          >
            Safe ({coursesWithMetrics.filter((c) => c.metrics.percentage >= 75).length})
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCourses.map((course) => (
          <SubjectCardItem key={course.courseId || course.courseCode} course={course} />
        ))}
      </div>
    </div>
  );
};

const SubjectCardItem: React.FC<{ course: any }> = ({ course }) => {
  const [expanded, setExpanded] = useState(false);
  const { metrics, totalPresent, totalPeriods } = course;
  const isSafe = metrics.percentage >= 75;
  const isWarning = metrics.percentage >= 65 && metrics.percentage < 75;

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between">
      <div>
        {/* Top: Code & Percentage */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
              {course.courseCode}
            </span>
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-1.5 line-clamp-2 leading-tight">
              {course.courseName}
            </h3>
          </div>

          <span
            className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold shrink-0 ${
              isSafe
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                : isWarning
                ? "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-800"
            }`}
          >
            {metrics.percentage}%
          </span>
        </div>

        {/* Progress Bar */}
        <div className="mt-3">
          <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                isSafe ? "bg-emerald-500" : isWarning ? "bg-amber-500" : "bg-rose-500"
              }`}
              style={{ width: `${Math.min(100, metrics.percentage)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 font-medium">
            <span>
              {totalPresent} of {totalPeriods} attended
            </span>
            <span>Target: 75%</span>
          </div>
        </div>

        {/* Target 75% Pill */}
        <div className="mt-3 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/60 dark:border-zinc-800 text-xs flex items-center justify-between">
          <span className="text-zinc-600 dark:text-zinc-400 font-medium">
            {isSafe ? "Safe Bunks Available" : "Classes Needed"}
          </span>
          <span
            className={`font-bold ${
              isSafe
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-rose-700 dark:text-rose-400"
            }`}
          >
            {isSafe ? `${metrics.safeBunks75} classes` : `${metrics.classesNeeded75} classes`}
          </span>
        </div>
      </div>

      {/* Components Dropdown (Theory / Practical) */}
      <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <span className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            <span>Components ({course.attendanceCourseComponentNameInfoList?.length || 0})</span>
          </span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {expanded && (
          <div className="mt-2 space-y-1.5">
            {course.attendanceCourseComponentNameInfoList?.map((comp: any, idx: number) => {
              const compPercent =
                comp.numberOfPeriods > 0
                  ? Math.round((comp.numberOfPresent / comp.numberOfPeriods) * 100)
                  : 0;
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between text-xs p-1.5 rounded bg-zinc-50 dark:bg-zinc-800/40 text-zinc-700 dark:text-zinc-300"
                >
                  <span className="font-medium">{comp.courseCompName}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {comp.numberOfPresent}/{comp.numberOfPeriods}
                    </span>
                    <span
                      className={`font-semibold ${
                        compPercent >= 75
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {compPercent}%
                    </span>
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

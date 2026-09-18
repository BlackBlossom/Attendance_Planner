"use client";

import React from "react";
import { CheckCircle2, AlertTriangle, XCircle, TrendingUp, ShieldAlert, Sparkles } from "lucide-react";
import { calculateMetrics } from "@/lib/attendance-math";

interface OverallCardProps {
  totalPresent: number;
  totalPeriods: number;
}

export const OverallCard: React.FC<OverallCardProps> = ({ totalPresent, totalPeriods }) => {
  const metrics75 = calculateMetrics(totalPresent, totalPeriods, 75);
  const metrics60 = calculateMetrics(totalPresent, totalPeriods, 60);

  const isSafe = metrics75.percentage >= 75;
  const isWarning = metrics75.percentage >= 65 && metrics75.percentage < 75;

  return (
    <div className="relative overflow-hidden rounded-2xl p-6 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xs">
      {/* Background Accent glow */}
      <div
        className={`absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full blur-3xl opacity-20 pointer-events-none ${
          isSafe ? "bg-emerald-500" : isWarning ? "bg-amber-500" : "bg-rose-500"
        }`}
      />

      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
        {/* Metric Overview */}
        <div className="flex items-start gap-4">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-2xs ${
              isSafe
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
                : isWarning
                ? "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400"
                : "bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400"
            }`}
          >
            {isSafe ? (
              <CheckCircle2 className="w-7 h-7" />
            ) : isWarning ? (
              <AlertTriangle className="w-7 h-7" />
            ) : (
              <XCircle className="w-7 h-7" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Aggregate Attendance
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                  isSafe
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                    : isWarning
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                    : "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300"
                }`}
              >
                {isSafe ? "Above 75%" : isWarning ? "Below 75%" : "Critical (<65%)"}
              </span>
            </div>

            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
                {metrics75.percentage}%
              </span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">
                {metrics75.present} attended of {metrics75.total} total
              </span>
            </div>
          </div>
        </div>

        {/* 75% Action Box */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* 75% Target Status */}
          <div
            className={`p-3.5 rounded-xl border flex items-start gap-3 min-w-[240px] ${
              isSafe
                ? "bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800/60"
                : "bg-rose-50/70 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800/60"
            }`}
          >
            {isSafe ? (
              <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            )}
            <div>
              <div
                className={`text-xs font-semibold uppercase tracking-wider ${
                  isSafe
                    ? "text-emerald-900 dark:text-emerald-200"
                    : "text-rose-900 dark:text-rose-200"
                }`}
              >
                75% Target Goal
              </div>
              <div
                className={`text-sm font-bold mt-0.5 ${
                  isSafe
                    ? "text-emerald-800 dark:text-emerald-300"
                    : "text-rose-800 dark:text-rose-300"
                }`}
              >
                {isSafe
                  ? `${metrics75.safeBunks} safe bunks left`
                  : `Need ${metrics75.classesNeeded} more classes`}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {isSafe
                  ? "Without dropping below the 75% threshold."
                  : "Continuous attendance to reach 75%."}
              </div>
            </div>
          </div>

          {/* 60% Target Status */}
          <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/40 flex items-start gap-3 min-w-[200px]">
            <TrendingUp className="w-5 h-5 text-zinc-600 dark:text-zinc-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                60% Minimum Safe
              </div>
              <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                {metrics60.percentage >= 60
                  ? `${metrics60.safeBunks} safe bunks`
                  : `Need ${metrics60.classesNeeded} classes`}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                For university exam admit card.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

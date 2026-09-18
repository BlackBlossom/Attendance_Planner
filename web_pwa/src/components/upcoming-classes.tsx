"use client";

import React from "react";
import { Clock, MapPin, Sparkles } from "lucide-react";

interface UpcomingClassesProps {
  classes: any[];
}

export const UpcomingClasses: React.FC<UpcomingClassesProps> = ({ classes }) => {
  if (!classes || classes.length === 0) return null;

  return (
    <div className="rounded-2xl p-5 border border-indigo-100 dark:border-indigo-900/60 bg-gradient-to-r from-indigo-50/50 via-white to-purple-50/50 dark:from-indigo-950/20 dark:via-zinc-900 dark:to-purple-950/20 shadow-xs">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
          Up Next Today
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {classes.slice(0, 3).map((cls, idx) => (
          <div
            key={idx}
            className="p-3 rounded-xl bg-white dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/60 text-xs shadow-2xs"
          >
            <div className="font-bold text-zinc-900 dark:text-zinc-100 text-sm line-clamp-1">
              {cls.titleFullName || cls.title}
            </div>
            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mt-1">
              <Clock className="w-3.5 h-3.5 text-indigo-500" />
              <span>
                {cls.start?.split(" ")[1]?.slice(0, 5)} - {cls.end?.split(" ")[1]?.slice(0, 5)}
              </span>
            </div>
            {cls.content && (
              <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300 mt-1">
                <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                <span className="line-clamp-1">{cls.content}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

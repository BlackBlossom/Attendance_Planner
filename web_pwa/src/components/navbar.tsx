"use client";

import React from "react";
import { LogOut, RefreshCw, GraduationCap, Download } from "lucide-react";
import { StudentProfile } from "@/lib/types";

interface NavbarProps {
  profile: StudentProfile | null;
  cgpa: string | null;
  isLoading: boolean;
  onRefresh: () => void;
  onLogout: () => void;
  canInstall?: boolean;
  onInstall?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  profile,
  cgpa,
  isLoading,
  onRefresh,
  onLogout,
  canInstall,
  onInstall,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Attendance Planner
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 hidden sm:block">
              KIET Group of Institutions
            </p>
          </div>
        </div>

        {/* User Info & Actions */}
        <div className="flex items-center gap-2 sm:gap-4">
          {profile && (
            <div className="flex items-center gap-3 pr-2 sm:border-r border-zinc-200 dark:border-zinc-800">
              {/* Profile Photo */}
              {profile.photoBase64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/jpeg;base64,${profile.photoBase64}`}
                  alt={profile.fullName}
                  className="w-9 h-9 rounded-full object-cover ring-2 ring-indigo-500/30 shadow-sm"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  {profile.firstName?.[0] || "S"}
                </div>
              )}

              <div className="text-left hidden md:block">
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
                  {profile.fullName}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {profile.rollNumber || profile.registrationNumber} • {profile.branchShortName || "CSE"} {profile.sectionName ? `(${profile.sectionName})` : ""}
                </div>
              </div>

              {cgpa && (
                <div className="hidden lg:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  {cgpa}
                </div>
              )}
            </div>
          )}

          {/* Install PWA Button if available */}
          {canInstall && (
            <button
              onClick={onInstall}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition-colors"
              title="Install App on device"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Install</span>
            </button>
          )}

          {/* Refresh */}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            title="Refresh Attendance & Schedule"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-indigo-500" : ""}`} />
          </button>

          {/* Logout */}
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/60 transition-colors"
            title="End Session"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
};

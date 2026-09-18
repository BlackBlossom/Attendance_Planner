"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard,
  Calendar as CalendarIcon,
  SlidersHorizontal,
  RefreshCw,
  AlertCircle,
  GraduationCap,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { LoginModal } from "@/components/login-modal";
import { OverallCard } from "@/components/overall-card";
import { SubjectCards } from "@/components/subject-cards";
import { CalendarView } from "@/components/calendar-view";
import { SchedulePlanner } from "@/components/schedule-planner";
import { UpcomingClasses } from "@/components/upcoming-classes";
import {
  StudentProfile,
  AttendanceCourseItem,
  DayWiseStatus,
  ScheduleClassItem,
} from "@/lib/types";

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [uid, setUid] = useState<string>("1405");
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "calendar" | "planner">("dashboard");

  // App Data
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [cgpa, setCgpa] = useState<string | null>(null);
  const [courses, setCourses] = useState<AttendanceCourseItem[]>([]);
  const [totalPresent, setTotalPresent] = useState(0);
  const [totalPeriods, setTotalPeriods] = useState(0);
  const [pastDays, setPastDays] = useState<DayWiseStatus[]>([]);
  const [schedule, setSchedule] = useState<ScheduleClassItem[]>([]);
  const [upcomingClasses, setUpcomingClasses] = useState<any[]>([]);

  // State flags
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Check URL param or sessionStorage on mount
  useEffect(() => {
    // 1. Check URL query params (?token=...)
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");

    if (urlToken) {
      sessionStorage.setItem("erp_token", urlToken);
      setToken(urlToken);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    // 2. Check sessionStorage
    const stored = sessionStorage.getItem("erp_token");
    const storedUid = sessionStorage.getItem("erp_student_id");
    if (storedUid) setUid(storedUid);

    if (stored) {
      setToken(stored);
    } else {
      setIsLoginOpen(true);
    }

    // PWA install event listener
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setDeferredPrompt(null);
  };

  const fetchScheduleForRange = useCallback(
    async (authToken: string, userUid: string, startStr: string, endStr: string) => {
      try {
        const schedRes = await fetch(
          `/api/schedule?weekStartDate=${startStr}&weekEndDate=${endStr}`,
          {
            headers: {
              Authorization: authToken,
              "x-erp-uid": userUid,
            },
          }
        );
        if (schedRes.ok) {
          const schedData = await schedRes.json();
          if (Array.isArray(schedData.data)) {
            setSchedule(schedData.data);
          }
        }
      } catch (err) {
        console.error("Failed to load schedule for range:", err);
      }
    },
    []
  );

  const loadData = useCallback(
    async (authToken: string, userUid = uid) => {
      setIsLoading(true);
      setError(null);

      try {
        const headers = {
          Authorization: authToken,
          "x-erp-uid": userUid,
        };

        // 1. Fetch Primary Attendance
        const attRes = await fetch("/api/attendance", { headers });
        if (attRes.status === 401) {
          sessionStorage.removeItem("erp_token");
          sessionStorage.removeItem("erp_student_id");
          setToken(null);
          setIsLoginOpen(true);
          throw new Error("Session expired. Please log in again.");
        }

        const attData = await attRes.json();
        if (attData.data) {
          const studentInfo = attData.data;
          const courseList: AttendanceCourseItem[] =
            studentInfo.attendanceCourseComponentInfoList || [];
          setCourses(courseList);

          let presentSum = 0;
          let periodSum = 0;
          courseList.forEach((c) => {
            c.attendanceCourseComponentNameInfoList?.forEach((comp) => {
              presentSum += comp.numberOfPresent || 0;
              periodSum += comp.numberOfPeriods || 0;
            });
          });
          setTotalPresent(presentSum);
          setTotalPeriods(periodSum);

          setProfile({
            fullName: studentInfo.fullName,
            firstName: studentInfo.firstName,
            lastName: studentInfo.lastName,
            registrationNumber: studentInfo.registrationNumber,
            rollNumber: studentInfo.rollNumber,
            sectionName: studentInfo.sectionName,
            branchShortName: studentInfo.branchShortName,
            degreeName: studentInfo.degreeName,
            semesterName: studentInfo.semesterName,
            admissionBatchName: studentInfo.admissionBatchName,
            academicSessionName: studentInfo.academicSessionName,
            degreeBranchSemesterName: studentInfo.degreeBranchSemesterName,
            totalComponent: studentInfo.totalComponent,
          });
        }

        // 2. Fetch Profile details, photo, CGPA & upcoming classes
        const profRes = await fetch("/api/profile", { headers });
        if (profRes.ok) {
          const profData = await profRes.json();
          if (profData.photo) {
            setProfile((prev) => (prev ? { ...prev, photoBase64: profData.photo } : prev));
          }
          if (profData.cgpa) setCgpa(profData.cgpa);
          if (profData.upcomingClasses) setUpcomingClasses(profData.upcomingClasses);
        }

        // 3. Fetch Past Day-Wise Attendance & Full-Day Absences
        const pastRes = await fetch("/api/past-attendance", { headers });
        if (pastRes.ok) {
          const pastData = await pastRes.json();
          if (Array.isArray(pastData.days)) setPastDays(pastData.days);
        }

        // 4. Fetch Schedule (default: current week from Sunday to Saturday)
        const now = new Date();
        const day = now.getDay();
        const sunday = new Date(now);
        sunday.setDate(now.getDate() - day);
        const saturday = new Date(sunday);
        saturday.setDate(sunday.getDate() + 6);

        const fmt = (d: Date) => d.toISOString().split("T")[0];
        await fetchScheduleForRange(authToken, userUid, fmt(sunday), fmt(saturday));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to synchronize data.");
      } finally {
        setIsLoading(false);
      }
    },
    [uid, fetchScheduleForRange]
  );

  useEffect(() => {
    if (token) {
      loadData(token);
    }
  }, [token, loadData]);

  const handleLoginSuccess = (newToken: string, studentId?: number) => {
    setIsLoginOpen(false);
    setToken(newToken);
    if (studentId) {
      setUid(String(studentId));
      sessionStorage.setItem("erp_student_id", String(studentId));
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("erp_token");
    sessionStorage.removeItem("erp_student_id");
    setToken(null);
    setProfile(null);
    setCourses([]);
    setPastDays([]);
    setSchedule([]);
    setIsLoginOpen(true);
  };

  const handleScheduleRangeChange = (startStr: string, endStr: string) => {
    if (token) {
      fetchScheduleForRange(token, uid, startStr, endStr);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Top Navbar */}
      <Navbar
        profile={profile}
        cgpa={cgpa}
        isLoading={isLoading}
        onRefresh={() => token && loadData(token)}
        onLogout={handleLogout}
        canInstall={!!deferredPrompt}
        onInstall={handleInstallPWA}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Error Banner */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-sm flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => token && loadData(token)}
              className="px-3 py-1 text-xs font-semibold rounded-lg bg-rose-200 dark:bg-rose-900/60 hover:bg-rose-300 dark:hover:bg-rose-900 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Not Logged In Callout */}
        {!token && (
          <div className="p-12 text-center rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 mx-auto flex items-center justify-center mb-4">
              <GraduationCap className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
              Welcome to Attendance Planner
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto mt-2">
              Sign in with your KIET CyberVidya account to inspect real-time attendance, track full-day absences, and simulate future bunking scenarios.
            </p>
            <button
              onClick={() => setIsLoginOpen(true)}
              className="mt-6 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-600/20 transition-all"
            >
              Sign In with OTP
            </button>
          </div>
        )}

        {/* Logged-in Content */}
        {token && (
          <>
            {/* Navigation Tabs */}
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  onClick={() => setActiveTab("dashboard")}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                    activeTab === "dashboard"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Overview & Subjects</span>
                </button>

                <button
                  onClick={() => setActiveTab("calendar")}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                    activeTab === "calendar"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <CalendarIcon className="w-4 h-4" />
                  <span>Calendar & Absences</span>
                  {pastDays.filter((d) => d.isFullDayAbsent).length > 0 && (
                    <span className="hidden md:inline-flex px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500 text-white">
                      {pastDays.filter((d) => d.isFullDayAbsent).length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab("planner")}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                    activeTab === "planner"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span>Bunk Planner & Simulator</span>
                </button>
              </div>

              {isLoading && (
                <div className="flex items-center gap-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span className="hidden sm:inline">Syncing with ERP...</span>
                </div>
              )}
            </div>

            {/* Tab 1: Dashboard Overview */}
            {activeTab === "dashboard" && (
              <div className="space-y-6">
                {/* Overall Attendance Card */}
                <OverallCard totalPresent={totalPresent} totalPeriods={totalPeriods} />

                {/* Up Next Today */}
                <UpcomingClasses classes={upcomingClasses} />

                {/* Subject Cards */}
                <SubjectCards courses={courses} />
              </div>
            )}

            {/* Tab 2: Calendar & Absences */}
            {activeTab === "calendar" && <CalendarView days={pastDays} />}

            {/* Tab 3: Future Bunk Planner & Simulator */}
            {activeTab === "planner" && (
              <SchedulePlanner
                schedule={schedule}
                courses={courses}
                pastDays={pastDays}
                onExportICS={() => {}}
                isLoading={isLoading}
                onRangeChange={handleScheduleRangeChange}
              />
            )}
          </>
        )}
      </main>

      {/* 2-Step Login Modal */}
      <LoginModal isOpen={isLoginOpen} onSuccess={handleLoginSuccess} />
    </div>
  );
}

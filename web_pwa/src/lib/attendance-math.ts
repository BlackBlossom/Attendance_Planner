export interface AttendanceMetrics {
  present: number;
  total: number;
  percentage: number;
  safeBunks: number;
  classesNeeded: number;
  status: "safe" | "warning" | "danger";
  targetPercentage: number;
}

export interface SubjectProjection {
  courseCode: string;
  courseName: string;
  currentPresent: number;
  currentTotal: number;
  currentPercentage: number;
  plannedUpcoming: number;
  plannedAttended: number;
  plannedBunked: number;
  projectedPresent: number;
  projectedTotal: number;
  projectedPercentage: number;
  percentageDelta: number;
  safeBunks: number;
  classesNeeded: number;
  status: "safe" | "warning" | "danger";
}

export interface OverallProjection {
  currentPresent: number;
  currentTotal: number;
  currentPercentage: number;
  projectedPresent: number;
  projectedTotal: number;
  projectedPercentage: number;
  percentageDelta: number;
  totalUpcomingClasses: number;
  totalPlannedAttended: number;
  totalPlannedBunks: number;
  safeBunksAtTarget: number;
  classesNeededAtTarget: number;
  daysToRecover: number;
  targetPercentage: number;
  status: "safe" | "warning" | "danger";
}

export interface BunkAdvice {
  courseCode: string;
  courseName: string;
  currentPercentage: number;
  percentIfBunked: number;
  deltaIfBunked: number;
  isSafeToBunk: boolean;
  bunkImpact: "safe" | "borderline" | "critical";
  remainingBunksAfterThis: number;
  adviceMessage: string;
}

/**
 * Calculates metrics for any target percentage (e.g. 60%, 75%, 80%, 85%)
 */
export function calculateMetrics(
  present: number,
  total: number,
  targetPercent = 75
): AttendanceMetrics {
  if (total <= 0) {
    return {
      present: 0,
      total: 0,
      percentage: 0,
      safeBunks: 0,
      classesNeeded: 0,
      status: "safe",
      targetPercentage: targetPercent,
    };
  }

  const percentage = (present / total) * 100;
  const targetDec = targetPercent / 100;

  let safeBunks = 0;
  let classesNeeded = 0;

  if (percentage >= targetPercent) {
    safeBunks = Math.floor((present - targetDec * total) / targetDec);
  } else {
    classesNeeded = Math.ceil((targetDec * total - present) / (1 - targetDec));
  }

  let status: "safe" | "warning" | "danger" = "safe";
  if (percentage < targetPercent - 10) {
    status = "danger";
  } else if (percentage < targetPercent) {
    status = "warning";
  }

  return {
    present,
    total,
    percentage: Math.round(percentage * 100) / 100,
    safeBunks: Math.max(0, safeBunks),
    classesNeeded: Math.max(0, classesNeeded),
    status,
    targetPercentage: targetPercent,
  };
}

/**
 * Analyzes whether skipping a specific subject's next lecture is safe or dangerous
 */
export function evaluateBunkAdvice(
  present: number,
  total: number,
  targetPercent = 75,
  courseCode = "",
  courseName = ""
): BunkAdvice {
  if (total <= 0) {
    return {
      courseCode,
      courseName,
      currentPercentage: 0,
      percentIfBunked: 0,
      deltaIfBunked: 0,
      isSafeToBunk: false,
      bunkImpact: "critical",
      remainingBunksAfterThis: 0,
      adviceMessage: "No attendance data available.",
    };
  }

  const currentPercent = (present / total) * 100;
  const newTotal = total + 1;
  const newPercent = (present / newTotal) * 100;
  const delta = newPercent - currentPercent;

  const targetDec = targetPercent / 100;
  const currentSafeBunks =
    currentPercent >= targetPercent
      ? Math.max(0, Math.floor((present - targetDec * total) / targetDec))
      : 0;

  const remainingAfter = Math.max(0, currentSafeBunks - 1);
  const isSafe = newPercent >= targetPercent;

  let bunkImpact: "safe" | "borderline" | "critical" = "safe";
  let adviceMessage = "";

  if (isSafe && newPercent >= targetPercent + 5) {
    bunkImpact = "safe";
    adviceMessage = `Safe to skip! Drops from ${currentPercent.toFixed(1)}% to ${newPercent.toFixed(1)}%, remaining ${remainingAfter} safe bunks above ${targetPercent}%.`;
  } else if (isSafe && newPercent >= targetPercent) {
    bunkImpact = "borderline";
    adviceMessage = `Warning: Missing this lecture will put you right on the ${targetPercent}% edge (${newPercent.toFixed(1)}%). Proceed with caution.`;
  } else {
    bunkImpact = "critical";
    const classesToFix = Math.ceil((targetDec * newTotal - present) / (1 - targetDec));
    adviceMessage = `DO NOT BUNK: Attendance is already below ${targetPercent}% or will drop to ${newPercent.toFixed(1)}%. It will take ${classesToFix} continuous classes to recover!`;
  }

  return {
    courseCode,
    courseName,
    currentPercentage: Math.round(currentPercent * 10) / 10,
    percentIfBunked: Math.round(newPercent * 10) / 10,
    deltaIfBunked: Math.round(delta * 10) / 10,
    isSafeToBunk: isSafe,
    bunkImpact,
    remainingBunksAfterThis: remainingAfter,
    adviceMessage,
  };
}

/**
 * Calculates how many continuous calendar days (assuming ~5 classes/day) needed to hit target
 */
export function calculateDaysToRecover(
  present: number,
  total: number,
  targetPercent = 75,
  avgClassesPerDay = 5
): { classesNeeded: number; daysNeeded: number } {
  const metrics = calculateMetrics(present, total, targetPercent);
  const classesNeeded = metrics.classesNeeded;
  const daysNeeded = Math.ceil(classesNeeded / Math.max(1, avgClassesPerDay));
  return { classesNeeded, daysNeeded };
}

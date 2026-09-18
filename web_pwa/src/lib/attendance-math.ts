export interface AttendanceMetrics {
  present: number;
  total: number;
  percentage: number;
  safeBunks75: number;
  classesNeeded75: number;
  safeBunks60: number;
  classesNeeded60: number;
  status75: "safe" | "warning" | "danger";
}

export function calculateMetrics(present: number, total: number): AttendanceMetrics {
  if (total <= 0) {
    return {
      present: 0,
      total: 0,
      percentage: 0,
      safeBunks75: 0,
      classesNeeded75: 0,
      safeBunks60: 0,
      classesNeeded60: 0,
      status75: "safe",
    };
  }

  const percentage = (present / total) * 100;

  // 75% target
  let safeBunks75 = 0;
  let classesNeeded75 = 0;
  if (percentage >= 75) {
    safeBunks75 = Math.floor((present - 0.75 * total) / 0.75);
  } else {
    classesNeeded75 = Math.ceil((0.75 * total - present) / 0.25);
  }

  // 60% target
  let safeBunks60 = 0;
  let classesNeeded60 = 0;
  if (percentage >= 60) {
    safeBunks60 = Math.floor((present - 0.60 * total) / 0.60);
  } else {
    classesNeeded60 = Math.ceil((0.60 * total - present) / 0.40);
  }

  let status75: "safe" | "warning" | "danger" = "safe";
  if (percentage < 65) {
    status75 = "danger";
  } else if (percentage < 75) {
    status75 = "warning";
  }

  return {
    present,
    total,
    percentage: Math.round(percentage * 100) / 100,
    safeBunks75: Math.max(0, safeBunks75),
    classesNeeded75: Math.max(0, classesNeeded75),
    safeBunks60: Math.max(0, safeBunks60),
    classesNeeded60: Math.max(0, classesNeeded60),
    status75,
  };
}

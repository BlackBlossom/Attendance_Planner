export interface CourseComponent {
  id: number | null;
  courseCompId: number;
  courseCompName: string;
  numberOfPresent: number;
  numberOfPeriods: number;
  percent?: number;
}

export interface AttendanceCourseItem {
  courseId: number;
  courseCode: string;
  courseName: string;
  facultyName?: string;
  attendanceCourseComponentNameInfoList: CourseComponent[];
  totalPresent?: number;
  totalPeriods?: number;
  percentage?: number;
}

export interface StudentProfile {
  fullName: string;
  firstName: string;
  lastName: string;
  registrationNumber: string;
  rollNumber: string;
  sectionName: string;
  branchShortName: string;
  degreeName: string;
  semesterName: string;
  admissionBatchName: string;
  academicSessionName: string;
  degreeBranchSemesterName: string;
  totalComponent?: number;
  photoBase64?: string;
}

export interface AttendanceResponse {
  data: {
    fullName: string;
    firstName: string;
    middleName?: string | null;
    lastName: string;
    registrationNumber: string;
    rollNumber: string;
    sectionName: string;
    branchShortName: string;
    degreeName: string;
    semesterName: string;
    admissionBatchName: string;
    academicSessionName: string;
    degreeBranchSemesterName: string;
    totalComponent: number;
    attendanceCourseComponentInfoList: AttendanceCourseItem[];
  };
}

export interface RegisteredCourse {
  id: number | null;
  studentId: number;
  courseId: number;
  courseCode: string;
  courseName: string;
  studentCourseCompDetails: {
    courseCompId: number;
    courseCompName: string;
    courseCompCredit?: number;
  }[];
}

export interface LectureAttendanceRecord {
  lectureDate: string;
  attendanceStatus: "P" | "A" | string;
  lectureNumber?: number;
  courseName?: string;
  courseCompName?: string;
}

export interface DayWiseStatus {
  date: string; // YYYY-MM-DD
  totalLectures: number;
  presentLectures: number;
  absentLectures: number;
  isFullDayAbsent: boolean;
  lectures: {
    courseName: string;
    compName: string;
    status: "P" | "A" | string;
    time?: string;
  }[];
}

export interface ScheduleClassItem {
  id?: number | null;
  start: string; // DD/MM/YYYY HH:MM:SS
  end: string;
  title: string;
  content?: string;
  courseName: string;
  courseCode: string;
  courseCompName: string;
  type: string;
  facultyName?: string;
  classRoom?: string;
  plannedAttend?: boolean;
}

export interface LoginInitiateResponse {
  success: boolean;
  message?: string;
  data?: {
    tfaEnable: boolean;
    maskEmail: string;
    counter: string | number;
    expiry: number;
    transactionId: string;
  };
  error?: string;
}

export interface VerifyOtpResponse {
  success: boolean;
  message?: string;
  token?: string;
  authPrefix?: string;
  registrationNumber?: string;
  studentId?: number;
  error?: string;
}

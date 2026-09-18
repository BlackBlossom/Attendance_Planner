# API and Token Documentation

This document captures all API endpoints, token names, and auth conventions used by the reference project and the Python implementation.

## 1) Token Sources and Names

- ERP localStorage key:
  - `authenticationtoken`
  - Source: browser extension content script reads this value from `https://kiet.cybervidya.net`.

- Web app cookie names (reference React app):
  - `auth_token` (stores ERP token)
  - `studentId` (derived from registered courses API)

- Python app session key:
  - `auth_token` in `st.session_state`
  - Can be set from URL query param `?token=...` or pasted manually.

## 2) Authorization Header Format

All authenticated requests use this header:

- Header name: `Authorization`
- Header value format: `GlobalEducation <token>`

Example:

```
Authorization: GlobalEducation eyJhbGciOi...
```

## 3) API Endpoints Used

Base host:

- `https://kiet.cybervidya.net`

Base API path:

- `https://kiet.cybervidya.net/api`

### 3.1 Current Attendance

- Method: `GET`
- URL: `/attendance/course/component/student`
- Full URL: `https://kiet.cybervidya.net/api/attendance/course/component/student`
- Auth: required (`Authorization: GlobalEducation <token>`)
- Purpose:
  - Fetches student profile + course/component attendance summary.
- Important response keys:
  - `data.fullName`
  - `data.registrationNumber`
  - `data.attendanceCourseComponentInfoList[]`
  - `courseName`, `courseCode`
  - `attendanceCourseComponentNameInfoList[].numberOfPresent`
  - `attendanceCourseComponentNameInfoList[].numberOfPeriods`

### 3.2 Schedule / Calendar Classes

- Method: `GET`
- URL: `/student/schedule/class`
- Full URL: `https://kiet.cybervidya.net/api/student/schedule/class`
- Query params:
  - `weekStartDate=YYYY-MM-DD`
  - `weekEndDate=YYYY-MM-DD`
- Auth: required (`Authorization: GlobalEducation <token>`)
- Purpose:
  - Fetches class schedule entries for given range.
- Important response keys:
  - `data[]`
  - `courseName`, `courseCode`, `courseCompName`
  - `start`, `end`
  - `lectureDate` (format `DD/MM/YYYY`)
  - `type` (`CLASS` or `HOLIDAY`)
  - `classRoom`, `facultyName`

### 3.3 Student ID (reference app utility)

- Method: `GET`
- URL: `/student/dashboard/registered-courses`
- Full URL: `https://kiet.cybervidya.net/api/student/dashboard/registered-courses`
- Auth: required
- Purpose:
  - Fetches registered courses and derives `studentId` from first row.

### 3.4 Daywise Attendance (reference app modal)

- Method: `POST`
- URL: `/attendance/schedule/student/course/attendance/percentage`
- Full URL: `https://kiet.cybervidya.net/api/attendance/schedule/student/course/attendance/percentage`
- Auth: required
- Content-Type: `application/json`
- Request body keys:
  - `courseCompId`
  - `courseId`
  - `sessionId` (nullable)
  - `studentId`
- Purpose:
  - Returns lecture-wise status (`PRESENT`, `ABSENT`, `ADJUSTED`).

## 4) Extension Flow (Reference)

1. User logs into ERP site (`kiet.cybervidya.net`).
2. Extension runs on `/home` and reads `localStorage.getItem("authenticationtoken")`.
3. Extension strips wrapping quotes if present.
4. Extension redirects to app origin with token query:
   - `/?token=<url-encoded-token>`
5. App reads `token` query param and stores it in app state/cookie/session.
6. App calls authenticated APIs using `Authorization: GlobalEducation <token>`.

## 5) Python Project Integration Summary

Implemented in `attendance_planner.py`:

- Live API mode:
  - Fetch current attendance from `GET /attendance/course/component/student`
  - Fetch schedule from `GET /student/schedule/class`
- Calendar support:
  - Converts fetched schedule to downloadable `.ics`
  - Supports `.ics` upload fallback
- Projection:
  - Lets user mark future classes as attended/missed
  - Recomputes per-course and overall percentages
  - Calculates classes needed for 60% and 75%
- Token handling:
  - Accepts URL token (`?token=...`)
  - Accepts manual token input in sidebar

## 6) Notes and Security

- Keep token private; it grants access to student data APIs.
- Do not log or share token in screenshots/public repos.
- If API returns 401, fetch a fresh token from ERP login and retry.

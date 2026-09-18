import base64
import calendar
import ctypes
import glob
import json
import math
import os
import re
import time
from ctypes import wintypes
from datetime import date, datetime, timedelta

import pandas as pd
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import streamlit as st
from icalendar import Calendar

API_BASE = "https://kiet.cybervidya.net/api"
AUTH_HEADER_PREFIX = "GlobalEducation"
ERP_LOCALSTORAGE_TOKEN_KEY = "authenticationtoken"

ATTENDANCE_URL = f"{API_BASE}/attendance/course/component/student"
SCHEDULE_URL = f"{API_BASE}/student/schedule/class"
REGISTERED_COURSES_URL = f"{API_BASE}/student/dashboard/registered-courses"
DAYWISE_ATTENDANCE_URL = f"{API_BASE}/attendance/schedule/student/course/attendance/percentage"

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://kiet.cybervidya.net",
    "Referer": "https://kiet.cybervidya.net/main/dashboard",
}

_session: requests.Session | None = None


def get_session() -> requests.Session:
    global _session
    if _session is None:
        session = requests.Session()
        retries = Retry(
            total=3,
            connect=3,
            read=2,
            backoff_factor=0.3,
            status_forcelist=[500, 502, 503, 504],
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retries, pool_connections=10, pool_maxsize=10)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        _session = session
    return _session


def build_headers(token: str) -> dict[str, str]:
    headers = dict(DEFAULT_HEADERS)
    headers["Authorization"] = f"{AUTH_HEADER_PREFIX} {token.strip()}"
    return headers


def _snappy_decompress(data: bytes) -> bytes:
    pos = 0
    length = 0
    shift = 0
    while pos < len(data):
        b = data[pos]
        pos += 1
        length |= (b & 0x7F) << shift
        if not (b & 0x80):
            break
        shift += 7
    out = bytearray()
    while pos < len(data):
        b = data[pos]
        pos += 1
        tag = b & 3
        if tag == 0:
            lit_len = b >> 2
            if lit_len < 60:
                lit_len += 1
            elif lit_len == 60:
                lit_len = data[pos] + 1
                pos += 1
            elif lit_len == 61:
                lit_len = int.from_bytes(data[pos : pos + 2], "little") + 1
                pos += 2
            elif lit_len == 62:
                lit_len = int.from_bytes(data[pos : pos + 3], "little") + 1
                pos += 3
            elif lit_len == 63:
                lit_len = int.from_bytes(data[pos : pos + 4], "little") + 1
                pos += 4
            out.extend(data[pos : pos + lit_len])
            pos += lit_len
        elif tag == 1:
            copy_len = ((b >> 2) & 7) + 4
            offset = ((b >> 5) << 8) | data[pos]
            pos += 1
            for _ in range(copy_len):
                out.append(out[-offset])
        elif tag == 2:
            copy_len = (b >> 2) + 1
            offset = int.from_bytes(data[pos : pos + 2], "little")
            pos += 2
            for _ in range(copy_len):
                out.append(out[-offset])
        elif tag == 3:
            copy_len = (b >> 2) + 1
            offset = int.from_bytes(data[pos : pos + 4], "little")
            pos += 4
            for _ in range(copy_len):
                out.append(out[-offset])
    return bytes(out)


def _read_varint(data: bytes, pos: int) -> tuple[int, int]:
    val = 0
    shift = 0
    while pos < len(data):
        b = data[pos]
        pos += 1
        val |= (b & 0x7F) << shift
        if not (b & 0x80):
            break
        shift += 7
    return val, pos


def _decode_jwt_payload(token_str: str) -> dict | None:
    try:
        parts = token_str.split(".")
        if len(parts) == 3:
            payload = parts[1] + "=" * (-len(parts[1]) % 4)
            return json.loads(base64.urlsafe_b64decode(payload))
    except Exception:
        pass
    return None


def _read_file_shared(fpath: str) -> bytes:
    try:
        handle = ctypes.windll.kernel32.CreateFileW(
            fpath, 0x80000000, 7, None, 3, 0x80, None
        )
        if handle == -1 or handle == 0xFFFFFFFF:
            with open(fpath, "rb") as f:
                return f.read()
        try:
            size = ctypes.windll.kernel32.GetFileSize(handle, None)
            buf = ctypes.create_string_buffer(size)
            bytes_read = wintypes.DWORD()
            ctypes.windll.kernel32.ReadFile(handle, buf, size, ctypes.byref(bytes_read), None)
            return buf.raw[: bytes_read.value]
        finally:
            ctypes.windll.kernel32.CloseHandle(handle)
    except Exception:
        try:
            with open(fpath, "rb") as f:
                return f.read()
        except Exception:
            return b""


def extract_cybervidya_token_from_browser() -> tuple[str, dict] | None:
    """
    Extracts the active 'authenticationtoken' for kiet.cybervidya.net
    directly from local browser storage (Chrome, Edge, Brave) on Windows.
    Reads files with shared file access so it succeeds even when browser is running.
    """
    browser_dirs = [
        ("Chrome", os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\User Data")),
        ("Edge", os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\User Data")),
        ("Brave", os.path.expandvars(r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data")),
    ]
    candidates = []
    jwt_re = re.compile(rb"eyJhbGciOiJIUzUxMiJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")

    for bname, bpath in browser_dirs:
        if not os.path.isdir(bpath):
            continue
        for ldir in glob.glob(os.path.join(bpath, "*", "Local Storage", "leveldb")):
            profile = os.path.basename(os.path.dirname(os.path.dirname(ldir)))
            try:
                filenames = os.listdir(ldir)
            except Exception:
                continue

            for fname in filenames:
                if not fname.endswith((".ldb", ".log")):
                    continue
                fpath = os.path.join(ldir, fname)
                raw = _read_file_shared(fpath)
                if not raw or b"cybervidya" not in raw.lower():
                    continue

                for m in jwt_re.finditer(raw):
                    tok = m.group(0).decode("ascii")
                    p = _decode_jwt_payload(tok)
                    if p and ("cybervidya" in str(p.get("iss", "")).lower() or "STUDENT" in str(p.get("scopes", ""))):
                        candidates.append((p.get("exp", 0), bname, profile, tok, p))

                if fname.endswith(".ldb") and len(raw) > 48:
                    try:
                        footer = raw[-48:]
                        _, p_off = _read_varint(footer, 0)
                        _, p_off = _read_varint(footer, p_off)
                        index_off, p_off = _read_varint(footer, p_off)
                        index_sz, p_off = _read_varint(footer, p_off)
                        index_raw = raw[index_off : index_off + index_sz]
                        index_comp = raw[index_off + index_sz]
                        index_data = _snappy_decompress(index_raw) if index_comp == 1 else index_raw
                        p_idx = 0
                        while p_idx < len(index_data) - 4:
                            shared, p_idx = _read_varint(index_data, p_idx)
                            non_shared, p_idx = _read_varint(index_data, p_idx)
                            val_len, p_idx = _read_varint(index_data, p_idx)
                            key_delta = index_data[p_idx : p_idx + non_shared]
                            p_idx += non_shared
                            val = index_data[p_idx : p_idx + val_len]
                            p_idx += val_len
                            blk_off, _ = _read_varint(val, 0)
                            blk_sz, _ = _read_varint(val, _)
                            blk_raw = raw[blk_off : blk_off + blk_sz]
                            comp = raw[blk_off + blk_sz]
                            decomp = _snappy_decompress(blk_raw) if comp == 1 else blk_raw
                            for m in jwt_re.finditer(decomp):
                                tok = m.group(0).decode("ascii")
                                p = _decode_jwt_payload(tok)
                                if p and ("cybervidya" in str(p.get("iss", "")).lower() or "STUDENT" in str(p.get("scopes", ""))):
                                    candidates.append((p.get("exp", 0), bname, profile, tok, p))
                    except Exception:
                        pass

    unique = {}
    for exp, bname, profile, tok, p in candidates:
        if tok not in unique or exp > unique[tok][0]:
            unique[tok] = (exp, bname, profile, tok, p)

    if not unique:
        return None

    sorted_tokens = sorted(unique.values(), key=lambda x: x[0], reverse=True)
    exp, bname, profile, tok, p = sorted_tokens[0]
    return tok, {
        "browser": bname,
        "profile": profile,
        "username": p.get("username", ""),
        "expires_at": exp,
        "expires_at_str": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(exp)) if exp else "",
        "is_active": (exp > time.time()) if exp else True,
    }


def to_float_or_none(value) -> float | None:
    if value is None:
        return None
    try:
        text = str(value).strip()
        if not text:
            return None
        return float(text)
    except (TypeError, ValueError):
        return None


def extract_credit_value(obj: dict | None) -> float | None:
    if not isinstance(obj, dict):
        return None

    possible_keys = (
        "courseCompCredit",
        "courseCredit",
        "courseCredits",
        "credit",
        "credits",
        "totalCredits",
        "numberOfCredits",
    )

    for key in possible_keys:
        if key in obj:
            parsed = to_float_or_none(obj.get(key))
            if parsed is not None:
                return parsed

    return None


@st.cache_data(ttl=120)
def fetch_attendance_data(token: str) -> dict:
    session = get_session()
    response = session.get(ATTENDANCE_URL, headers=build_headers(token), timeout=(10, 25))
    if response.status_code == 401:
        raise RuntimeError("Unauthorized token. Please login again from ERP and paste a fresh token.")
    response.raise_for_status()
    return response.json()


@st.cache_data(ttl=120)
def fetch_schedule_data(token: str, start_date: date, end_date: date) -> list[dict]:
    params = {
        "weekStartDate": start_date.strftime("%Y-%m-%d"),
        "weekEndDate": end_date.strftime("%Y-%m-%d"),
    }
    session = get_session()
    response = session.get(
        SCHEDULE_URL,
        headers=build_headers(token),
        params=params,
        timeout=(10, 25),
    )
    if response.status_code == 401:
        raise RuntimeError("Unauthorized token. Please login again from ERP and paste a fresh token.")
    response.raise_for_status()
    payload = response.json()
    return payload.get("data", []) if isinstance(payload, dict) else []


@st.cache_data(ttl=120)
def fetch_registered_courses(token: str) -> list[dict]:
    session = get_session()
    response = session.get(
        REGISTERED_COURSES_URL,
        headers=build_headers(token),
        timeout=(10, 25),
    )
    if response.status_code == 401:
        raise RuntimeError("Unauthorized token. Please login again from ERP and paste a fresh token.")
    response.raise_for_status()
    payload = response.json()
    rows = payload.get("data", []) if isinstance(payload, dict) else []
    return rows if isinstance(rows, list) else []


@st.cache_data(ttl=120)
def fetch_student_id(token: str) -> int | None:
    rows = fetch_registered_courses(token)
    if not rows:
        return None
    return rows[0].get("studentId")


def build_credits_maps(
    registered_courses: list[dict],
) -> tuple[dict[str, float], dict[int, float], dict[int, float]]:
    credits_by_code: dict[str, float] = {}
    credits_by_id: dict[int, float] = {}
    credits_by_component_id: dict[int, float] = {}

    for course in registered_courses:
        if not isinstance(course, dict):
            continue

        credit = extract_credit_value(course)
        if credit is None:
            comp_details = course.get("studentCourseCompDetails")
            if isinstance(comp_details, list):
                for comp in comp_details:
                    if not isinstance(comp, dict):
                        continue
                    comp_credit = extract_credit_value(comp)
                    if comp_credit is None:
                        continue

                    comp_id_val = comp.get("courseCompId")
                    try:
                        comp_id = int(comp_id_val)
                    except (TypeError, ValueError):
                        comp_id = 0

                    if comp_id > 0:
                        credits_by_component_id[comp_id] = comp_credit

                    if credit is None:
                        credit = comp_credit

        if credit is None:
            continue

        course_code = str(course.get("courseCode", "")).strip()
        if course_code:
            credits_by_code[course_code] = credit

        course_id_val = course.get("courseId")
        try:
            course_id = int(course_id_val)
        except (TypeError, ValueError):
            course_id = 0
        if course_id > 0:
            credits_by_id[course_id] = credit

    return credits_by_code, credits_by_id, credits_by_component_id


@st.cache_data(ttl=120)
def fetch_daywise_attendance(
    token: str,
    student_id: int,
    course_id: int,
    component_id: int,
) -> list[dict]:
    payload = {
        "courseCompId": component_id,
        "courseId": course_id,
        "sessionId": None,
        "studentId": student_id,
    }
    session = get_session()
    response = session.post(
        DAYWISE_ATTENDANCE_URL,
        headers={
            **build_headers(token),
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=(10, 25),
    )
    if response.status_code == 401:
        raise RuntimeError("Unauthorized token. Please login again from ERP and paste a fresh token.")
    if response.status_code == 400:
        try:
            body = response.json()
            reason = str(body.get("error", {}).get("reason", ""))
            if "no data found" in reason.lower():
                return []
        except Exception:
            pass
    response.raise_for_status()
    body = response.json()
    data_rows = body.get("data", []) if isinstance(body, dict) else []
    if not data_rows:
        return []
    first = data_rows[0] if isinstance(data_rows[0], dict) else {}
    lecture_list = first.get("lectureList", []) if isinstance(first, dict) else []
    return lecture_list if isinstance(lecture_list, list) else []


def parse_any_date(date_value: str) -> date | None:
    if not date_value:
        return None

    formats = [
        "%Y-%m-%d",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%d/%m/%Y",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(date_value, fmt).date()
        except ValueError:
            continue

    try:
        return datetime.fromisoformat(date_value.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def collect_daywise_rows_for_range(
    token: str,
    student_id: int,
    attendance_map: dict[str, dict],
    start_date: date,
    end_date: date,
    use_range: bool = True,
    additional_dates: set[date] | None = None,
) -> list[dict]:
    additional_dates = additional_dates or set()
    rows: list[dict] = []

    for course_code, details in attendance_map.items():
        course_id = int(details.get("course_id", 0) or 0)
        component_id = int(details.get("component_id", 0) or 0)
        total_periods = int(details.get("total", 0) or 0)

        # Skip courses with no valid IDs or 0 total periods to avoid unnecessary API errors
        if course_id <= 0 or component_id <= 0 or total_periods <= 0:
            continue

        try:
            lectures = fetch_daywise_attendance(
                token=token,
                student_id=student_id,
                course_id=course_id,
                component_id=component_id,
            )
        except Exception as exc:
            st.warning(f"Could not load daywise records for {details.get('subject') or course_code}: {exc}")
            continue

        for lecture in lectures:
            lecture_date = parse_any_date(str(lecture.get("planLecDate", "")))
            if lecture_date is None:
                continue
            in_range = use_range and start_date <= lecture_date <= end_date
            in_specific_days = lecture_date in additional_dates
            if not (in_range or in_specific_days):
                continue

            status = str(lecture.get("attendance", "")).strip().upper() or "UNKNOWN"
            time_slot = str(lecture.get("timeSlot", "")).strip()
            lecture_key = f"{course_code}|{lecture_date.isoformat()}|{time_slot}"
            rows.append(
                {
                    "Lecture Key": lecture_key,
                    "Date": lecture_date,
                    "Subject": details.get("subject") or course_code,
                    "Course Code": course_code,
                    "Time Slot": time_slot,
                    "Original Attendance": status,
                    "Can Adjust": status == "ABSENT",
                    "Adjust Absent": False,
                }
            )

    rows.sort(
        key=lambda item: (
            item["Date"],
            item["Course Code"],
            item["Time Slot"],
        )
    )
    return rows


def parse_attendance(
    raw: dict,
    credits_by_code: dict[str, float] | None = None,
    credits_by_id: dict[int, float] | None = None,
    credits_by_component_id: dict[int, float] | None = None,
) -> tuple[dict[str, dict], pd.DataFrame]:
    credits_by_code = credits_by_code or {}
    credits_by_id = credits_by_id or {}
    credits_by_component_id = credits_by_component_id or {}

    data = raw.get("data", {})
    courses = data.get("attendanceCourseComponentInfoList", [])
    rows = []
    attendance_map: dict[str, dict] = {}

    for course in courses:
        course_name = course.get("courseName", "Unknown")
        course_code = course.get("courseCode", "NA")
        components = course.get("attendanceCourseComponentNameInfoList", [])
        if not components:
            continue

        first_component = components[0]
        component_id = int(first_component.get("courseComponentId", 0) or 0)
        present_without_extra = int(float(first_component.get("numberOfPresent", 0)))
        extra_attendance = int(float(first_component.get("numberOfExtraAttendance", 0)))
        present = present_without_extra + extra_attendance
        total = int(float(first_component.get("numberOfPeriods", 0)))
        course_id = int(course.get("courseId", 0) or 0)

        credits = extract_credit_value(course)
        if credits is None:
            credits = extract_credit_value(first_component)
        if credits is None and component_id in credits_by_component_id:
            credits = credits_by_component_id[component_id]
        if credits is None and course_code in credits_by_code:
            credits = credits_by_code[course_code]
        if credits is None and course_id in credits_by_id:
            credits = credits_by_id[course_id]

        key = course_code
        attendance_map[key] = {
            "subject": course_name,
            "credits": credits,
            "present": present,
            "present_without_extra": present_without_extra,
            "extra_attendance": extra_attendance,
            "total": total,
            "course_id": course_id,
            "component_id": component_id,
        }
        rows.append(
            [
                course_name,
                course_code,
                credits,
                present_without_extra,
                extra_attendance,
                present,
                total,
            ]
        )

    df = pd.DataFrame(
        rows,
        columns=[
            "Subject",
            "Course Code",
            "Credits",
            "Present (Without Extra)",
            "Extra Attendance",
            "Present",
            "Total",
        ],
    )

    if not df.empty:
        df["Credits"] = pd.to_numeric(df["Credits"], errors="coerce")

    return attendance_map, df


def parse_ics_events(ics_bytes: bytes) -> pd.DataFrame:
    events: list[dict] = []
    cal = Calendar.from_ical(ics_bytes)

    for component in cal.walk():
        if component.name != "VEVENT":
            continue
        start = component.get("dtstart")
        summary = component.get("summary")
        if start is None:
            continue

        start_dt = start.dt
        if isinstance(start_dt, datetime):
            events.append(
                {
                    "datetime": start_dt,
                    "date": start_dt.date(),
                    "subject": str(summary) if summary else "Unknown",
                    "course_code": "NA",
                    "attend": True,
                }
            )

    return pd.DataFrame(events)


def parse_schedule_events(schedule: list[dict]) -> pd.DataFrame:
    rows: list[dict] = []
    seen = set()
    for entry in schedule:
        if entry.get("type") != "CLASS":
            continue
        lecture_date = entry.get("lectureDate")
        start = str(entry.get("start", "")).split(" ")[-1]
        end = str(entry.get("end", "")).split(" ")[-1]
        if not lecture_date or not start:
            continue

        key = (entry.get("courseCode"), lecture_date, start)
        if key in seen:
            continue
        seen.add(key)

        try:
            dt = datetime.strptime(f"{lecture_date} {start}", "%d/%m/%Y %H:%M:%S")
        except ValueError:
            continue

        rows.append(
            {
                "datetime": dt,
                "date": dt.date(),
                "subject": entry.get("courseName", "Unknown"),
                "course_code": entry.get("courseCode", "NA"),
                "start": start,
                "end": end,
                "classroom": entry.get("classRoom", ""),
                "faculty": entry.get("facultyName", ""),
                "attend": True,
            }
        )

    if not rows:
        return pd.DataFrame(
            columns=[
                "datetime",
                "date",
                "subject",
                "course_code",
                "start",
                "end",
                "classroom",
                "faculty",
                "attend",
            ]
        )

    df = pd.DataFrame(rows).sort_values("datetime").reset_index(drop=True)
    return df


def generate_ics(schedule_df: pd.DataFrame) -> str:
    eol = "\r\n"
    now = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Attendance Planner//Semester Timetable//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "",
    ]

    for _, row in schedule_df.iterrows():
        start_dt = row["datetime"]
        end_dt = start_dt
        end_time = row.get("end", "")
        if end_time:
            try:
                parsed_end = datetime.strptime(end_time, "%H:%M:%S")
                end_dt = start_dt.replace(
                    hour=parsed_end.hour,
                    minute=parsed_end.minute,
                    second=parsed_end.second,
                )
            except ValueError:
                end_dt = start_dt + timedelta(hours=1)

        dt_start = start_dt.strftime("%Y%m%dT%H%M%SZ")
        dt_end = end_dt.strftime("%Y%m%dT%H%M%SZ")

        uid = f"{row.get('course_code', 'NA')}-{dt_start}@attendance-planner"
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:{uid}",
                f"DTSTAMP:{now}",
                f"DTSTART:{dt_start}",
                f"DTEND:{dt_end}",
                f"SUMMARY:{str(row.get('subject', '')).replace(',', '\\,')}",
                f"LOCATION:{str(row.get('classroom', '')).replace(',', '\\,')}",
                "END:VEVENT",
                "",
            ]
        )

    lines.append("END:VCALENDAR")
    return eol.join(lines) + eol


def render_html_safely(html_str: str) -> None:
    clean_html = "\n".join(line.strip() for line in html_str.strip().splitlines() if line.strip())
    try:
        if hasattr(st, "html"):
            st.html(clean_html)
        else:
            st.markdown(clean_html, unsafe_allow_html=True)
    except Exception:
        st.markdown(clean_html, unsafe_allow_html=True)


def render_calendar_html(
    year: int,
    month: int,
    daily_stats: dict,
    today: date,
    active_map: dict | None = None,
) -> str:
    active_map = active_map or {}
    cal = calendar.Calendar(firstweekday=0)
    weeks = cal.monthdatescalendar(year, month)

    icon_check = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;"><polyline points="20 6 9 17 4 12"></polyline></svg>'
    icon_cross = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
    icon_clock = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'
    icon_adjust = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'

    parts = [
        '<div style="font-family: system-ui, -apple-system, sans-serif; margin: 4px 0 16px 0;">',
        '<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; text-align: center; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; opacity: 0.7;">',
        '<div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div>',
        '</div>',
        '<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px;">',
    ]

    for week in weeks:
        for day in week:
            in_month = (day.month == month)
            day_num = day.day
            opacity = "1" if in_month else "0.28"
            day_info = daily_stats.get(day)
            is_today = (day == today)

            today_badge = '<span style="font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #2563eb; background: rgba(37, 99, 235, 0.12); padding: 1px 5px; border-radius: 4px;">Today</span>' if is_today else ''

            if day > today:
                card_bg = "rgba(148, 163, 184, 0.03)"
                border = "1px solid rgba(148, 163, 184, 0.15)"
                header_badge = today_badge
                bottom_content = '<span style="font-size: 10px; opacity: 0.45; font-weight: 500;">Future</span>'
            elif not day_info:
                card_bg = "rgba(59, 130, 246, 0.06)" if is_today else "rgba(148, 163, 184, 0.03)"
                border = "1.5px solid #3b82f6" if is_today else "1px dashed rgba(148, 163, 184, 0.2)"
                header_badge = today_badge
                bottom_content = '<span style="font-size: 10px; opacity: 0.45; font-weight: 500;">No class</span>'
            else:
                total = day_info["total"]
                absent = day_info["absent"]
                present = day_info["present"]
                adjusted = day_info["adjusted"]

                active_adj_count = sum(
                    1 for l in day_info["lectures"]
                    if bool(active_map.get(l.get("Lecture Key", ""), False)) and l.get("Can Adjust", False)
                )

                eff_present = present + adjusted + active_adj_count

                if absent == total and total > 0:
                    if active_adj_count == total:
                        card_bg = "rgba(14, 165, 233, 0.07)"
                        border = "1px solid rgba(14, 165, 233, 0.35)"
                        header_badge = today_badge or '<span style="font-size: 9px; font-weight: 600; color: #0284c7; background: rgba(14, 165, 233, 0.12); padding: 1px 5px; border-radius: 4px;">Adjusted</span>'
                        bottom_content = f'<div style="font-size: 11px; font-weight: 600; color: #0284c7; display: flex; align-items: center; gap: 4px;">{icon_adjust} <span>{total}/{total} adj</span></div>'
                    else:
                        card_bg = "rgba(244, 63, 94, 0.06)"
                        border = "1px solid rgba(244, 63, 94, 0.3)"
                        header_badge = today_badge or '<span style="font-size: 9px; font-weight: 600; color: #e11d48; background: rgba(244, 63, 94, 0.12); padding: 1px 5px; border-radius: 4px;">Absent</span>'
                        adj_sub = f" <span style='color:#0284c7;font-weight:600;'>({active_adj_count} adj)</span>" if active_adj_count > 0 else ""
                        bottom_content = f'<div style="font-size: 11px; font-weight: 600; color: #e11d48; display: flex; align-items: center; gap: 4px;">{icon_cross} <span>0/{total} missed</span>{adj_sub}</div>'
                elif eff_present >= total and total > 0:
                    card_bg = "rgba(16, 185, 129, 0.06)"
                    border = "1px solid rgba(16, 185, 129, 0.3)"
                    header_badge = today_badge or '<span style="font-size: 9px; font-weight: 600; color: #16a34a; background: rgba(22, 163, 74, 0.12); padding: 1px 5px; border-radius: 4px;">Present</span>'
                    bottom_content = f'<div style="font-size: 11px; font-weight: 600; color: #16a34a; display: flex; align-items: center; gap: 4px;">{icon_check} <span>{total}/{total}</span></div>'
                else:
                    pct = round((eff_present / total) * 100) if total else 0
                    card_bg = "rgba(245, 158, 11, 0.06)"
                    border = "1px solid rgba(245, 158, 11, 0.3)"
                    header_badge = today_badge or f'<span style="font-size: 9px; font-weight: 600; color: #d97706; background: rgba(245, 158, 11, 0.12); padding: 1px 5px; border-radius: 4px;">{pct}%</span>'
                    adj_sub = f" <span style='color:#0284c7;font-weight:600;'>({active_adj_count} adj)</span>" if active_adj_count > 0 else ""
                    bottom_content = f'<div style="font-size: 11px; font-weight: 600; color: #d97706; display: flex; align-items: center; gap: 4px;">{icon_clock} <span>{eff_present}/{total}</span>{adj_sub}</div>'

            parts.append(
                f'<div style="background: {card_bg}; border: {border}; border-radius: 8px; padding: 7px 8px; min-height: 72px; opacity: {opacity}; display: flex; flex-direction: column; justify-content: space-between;">'
                f'<div style="display: flex; justify-content: space-between; align-items: center;">'
                f'<span style="font-size: 13px; font-weight: 600; color: inherit; line-height: 1;">{day_num}</span>'
                f'{header_badge}'
                f'</div>'
                f'{bottom_content}'
                f'</div>'
            )

    parts.append('</div></div>')
    return "".join(parts)


def classes_needed_for_target(present: int, total: int, target: float) -> int:
    if total <= 0:
        return 0
    percentage = (present / total) * 100
    if percentage >= target:
        return 0
    numerator = (target / 100.0) * total - present
    denominator = 1 - (target / 100.0)
    return max(0, math.ceil(numerator / denominator))


def compute_projection(
    base_attendance: dict[str, dict],
    events_df: pd.DataFrame,
    manual_extra_adjustments_by_code: dict[str, int] | None = None,
) -> pd.DataFrame:
    manual_extra_adjustments_by_code = manual_extra_adjustments_by_code or {}

    future = {
        code: {
            "Subject": item["subject"],
            "Course Code": code,
            "Credits": item.get("credits"),
            "Regular Present": int(item.get("present_without_extra", item["present"])),
            "Extra Attendance": max(
                0,
                int(item.get("extra_attendance", 0))
                + int(manual_extra_adjustments_by_code.get(code, 0)),
            ),
            "Total": int(item["total"]),
        }
        for code, item in base_attendance.items()
    }

    for _, row in events_df.iterrows():
        code = row.get("course_code", "NA")
        subject = row.get("subject", "Unknown")
        attend = bool(row.get("attend", False))

        if code not in future:
            future[code] = {
                "Subject": subject,
                "Course Code": code,
                "Credits": None,
                "Regular Present": 0,
                "Extra Attendance": max(0, int(manual_extra_adjustments_by_code.get(code, 0))),
                "Total": 0,
            }

        future[code]["Total"] += 1
        if attend:
            future[code]["Regular Present"] += 1

    projected = pd.DataFrame(list(future.values()))
    if projected.empty:
        projected = pd.DataFrame(
            columns=["Subject", "Course Code", "Regular Present", "Extra Attendance", "Total"]
        )

    projected["Regular Present"] = (
        pd.to_numeric(projected["Regular Present"], errors="coerce").fillna(0).astype(int)
    )
    projected["Extra Attendance"] = (
        pd.to_numeric(projected["Extra Attendance"], errors="coerce").fillna(0).astype(int)
    )
    projected["Present"] = projected["Regular Present"] + projected["Extra Attendance"]

    projected["Present"] = pd.to_numeric(projected["Present"], errors="coerce").fillna(0).astype(int)
    projected["Total"] = pd.to_numeric(projected["Total"], errors="coerce").fillna(0).astype(int)
    projected["Credits"] = pd.to_numeric(projected["Credits"], errors="coerce")

    projected["Percentage"] = 0.0
    mask = projected["Total"] > 0
    projected.loc[mask, "Percentage"] = (
        (projected.loc[mask, "Present"] / projected.loc[mask, "Total"]) * 100
    ).round(2)

    projected["Classes Needed for 60%"] = projected.apply(
        lambda r: classes_needed_for_target(int(r["Present"]), int(r["Total"]), 60.0),
        axis=1,
    )
    projected["Classes Needed for 75%"] = projected.apply(
        lambda r: classes_needed_for_target(int(r["Present"]), int(r["Total"]), 75.0),
        axis=1,
    )

    projected = projected.sort_values("Subject").reset_index(drop=True)
    if "Regular Present" in projected.columns:
        projected = projected.drop(columns=["Regular Present"])

    return projected


st.set_page_config(layout="wide")
st.title("Smart Attendance Planner")
st.caption("Live ERP API mode + upload mode")

if "auth_token" not in st.session_state:
    st.session_state["auth_token"] = ""
if "token_info" not in st.session_state:
    st.session_state["token_info"] = None

# Automatic silent token extraction from browser on startup
if not st.session_state["auth_token"] and not st.session_state.get("auto_extract_attempted"):
    st.session_state["auto_extract_attempted"] = True
    auto_res = extract_cybervidya_token_from_browser()
    if auto_res:
        tok, info = auto_res
        if info.get("is_active", True):
            st.session_state["auth_token"] = tok
            st.session_state["token_info"] = info

# Token can also be passed from extension as ?token=<value>
url_token = st.query_params.get("token")
if isinstance(url_token, str) and url_token.strip() and not st.session_state["auth_token"]:
    st.session_state["auth_token"] = url_token.strip()
    st.session_state["token_info"] = {"browser": "Extension", "profile": "Bridge", "username": "", "is_active": True}

with st.sidebar:
    st.header("ERP Connection")

    if st.button("Extract Token from Browser", use_container_width=True, type="primary"):
        with st.spinner("Searching browser local storage..."):
            res = extract_cybervidya_token_from_browser()
            if res:
                tok, info = res
                st.session_state["auth_token"] = tok
                st.session_state["token_info"] = info
                st.cache_data.clear()
                if info.get("is_active"):
                    st.success(f"Token extracted from {info.get('browser')} ({info.get('profile')}) for {info.get('username')}.")
                else:
                    st.warning(f"Extracted token from {info.get('browser')} ({info.get('profile')}), but it may have expired.")
                st.rerun()
            else:
                st.error("No token found in browser storage. Please log in to kiet.cybervidya.net first.")

    curr_info = st.session_state.get("token_info")
    if st.session_state.get("auth_token"):
        if curr_info and curr_info.get("browser"):
            st.caption(f"Connected: {curr_info['browser']} ({curr_info.get('profile', '')}) · Student: {curr_info.get('username', '')}")
        else:
            st.caption("Connected with active portal session.")
    else:
        st.caption("Not connected. Click above to extract your token automatically.")

    with st.expander("Manual Token Entry"):
        st.caption(f"ERP localStorage key: `{ERP_LOCALSTORAGE_TOKEN_KEY}`")
        manual_token = st.text_input(
            "Portal Token",
            value=st.session_state["auth_token"],
            type="password",
            help="Paste authenticationtoken value from ERP, or use auto-extract above.",
        )

        col_save, col_clear = st.columns(2)
        with col_save:
            if st.button("Use Token", use_container_width=True):
                st.session_state["auth_token"] = manual_token.strip()
                st.session_state["token_info"] = {"browser": "Manual", "profile": "", "username": "", "is_active": True}
                st.cache_data.clear()
                st.rerun()
        with col_clear:
            if st.button("Clear", use_container_width=True):
                st.session_state["auth_token"] = ""
                st.session_state["token_info"] = None
                st.cache_data.clear()
                st.rerun()

token = st.session_state.get("auth_token", "").strip()
today = date.today()

st.subheader("Today")
st.write(f"{today.strftime('%A, %d %B %Y')}")

st.header("1. Current Attendance")

attendance_map: dict[str, dict] = {}
attendance_df = pd.DataFrame(columns=["Subject", "Course Code", "Present", "Total"])
credits_by_code: dict[str, float] = {}
credits_by_id: dict[int, float] = {}
credits_by_component_id: dict[int, float] = {}

if token:
    try:
        registered_courses = fetch_registered_courses(token)
        credits_by_code, credits_by_id, credits_by_component_id = build_credits_maps(
            registered_courses
        )
    except Exception:
        # Credits are helpful metadata; continue even if this API is unavailable.
        pass

if token:
    try:
        attendance_raw = fetch_attendance_data(token)
        attendance_map, attendance_df = parse_attendance(
            attendance_raw,
            credits_by_code=credits_by_code,
            credits_by_id=credits_by_id,
            credits_by_component_id=credits_by_component_id,
        )
        st.success("Attendance fetched from CyberVidya API.")
    except Exception as exc:
        st.error(f"API fetch failed: {exc}")

if attendance_df.empty:
    st.info("No API attendance data loaded. You can upload attendance JSON as fallback.")
    uploaded_attendance = st.file_uploader("Upload attendance JSON", type=["json"])
    if uploaded_attendance is not None:
        try:
            attendance_raw = json.load(uploaded_attendance)
            attendance_map, attendance_df = parse_attendance(
                attendance_raw,
                credits_by_code=credits_by_code,
                credits_by_id=credits_by_id,
                credits_by_component_id=credits_by_component_id,
            )
            st.success("Attendance loaded from JSON upload.")
        except Exception as exc:
            st.error(f"Invalid attendance JSON: {exc}")

if not attendance_df.empty:
    st.dataframe(attendance_df, use_container_width=True)

    current_total_present = int(attendance_df["Present"].sum())
    current_total_lectures = int(attendance_df["Total"].sum())
    current_overall = (
        (current_total_present / current_total_lectures) * 100
        if current_total_lectures
        else 0.0
    )
    cur_col1, cur_col2, cur_col3 = st.columns(3)
    cur_col1.metric("Overall Current Lectures", current_total_lectures)
    cur_col2.metric("Overall Current Present", current_total_present)
    cur_col3.metric("Overall Current Attendance", f"{current_overall:.2f}%")

st.header("2. Calendar / Timetable")

schedule_df = pd.DataFrame()
default_end = today + timedelta(days=120)
date_col1, date_col2 = st.columns(2)
with date_col1:
    range_start = st.date_input("Start date", value=today)
with date_col2:
    range_end = st.date_input("End date", value=default_end)

if range_end < range_start:
    st.warning("End date is before start date. Please fix the range.")
else:
    if token:
        try:
            schedule_payload = fetch_schedule_data(token, range_start, range_end)
            schedule_df = parse_schedule_events(schedule_payload)
            if not schedule_df.empty:
                st.success(f"Fetched {len(schedule_df)} classes from schedule API.")
            else:
                st.info("No class events in selected date range from API.")
        except Exception as exc:
            st.error(f"Schedule API fetch failed: {exc}")

if schedule_df.empty:
    uploaded_ics = st.file_uploader("Upload timetable (.ics) fallback", type=["ics"])
    if uploaded_ics is not None:
        try:
            schedule_df = parse_ics_events(uploaded_ics.read())
            if not schedule_df.empty:
                st.success("Schedule loaded from ICS upload.")
            else:
                st.info("ICS loaded but no class events found.")
        except Exception as exc:
            st.error(f"Invalid ICS file: {exc}")

if not schedule_df.empty:
    st.dataframe(
        schedule_df[["date", "subject", "course_code", "start", "end"]]
        if "start" in schedule_df.columns
        else schedule_df[["date", "subject", "course_code"]],
        use_container_width=True,
    )

    ics_content = generate_ics(schedule_df)
    st.download_button(
        "Download Calendar (.ics)",
        data=ics_content.encode("utf-8"),
        file_name="semester-timetable.ics",
        mime="text/calendar",
    )

st.header("3. Today's Daywise Attendance")

marked_today_course_codes: set[str] = set()

if schedule_df.empty:
    st.info("Load schedule data to evaluate today's classes.")
else:
    todays_rows = schedule_df[schedule_df["date"] == today].copy()
    if todays_rows.empty:
        st.info("No classes found for today in current schedule range.")
    elif not token:
        st.info("Daywise attendance check requires a valid portal token.")
    else:
        daywise_rows: list[dict] = []
        try:
            student_id = fetch_student_id(token)
            if student_id is None:
                st.warning("Could not determine studentId from API; skipping daywise check.")
            else:
                unique_codes = sorted(todays_rows["course_code"].dropna().unique())
                for course_code in unique_codes:
                    details = attendance_map.get(course_code, {})
                    course_id = int(details.get("course_id", 0) or 0)
                    component_id = int(details.get("component_id", 0) or 0)
                    total_periods = int(details.get("total", 0) or 0)

                    if course_id <= 0 or component_id <= 0 or total_periods <= 0:
                        continue

                    try:
                        lectures = fetch_daywise_attendance(
                            token=token,
                            student_id=student_id,
                            course_id=course_id,
                            component_id=component_id,
                        )
                    except Exception as exc:
                        st.warning(f"Could not check today's attendance for {details.get('subject') or course_code}: {exc}")
                        continue

                    for lecture in lectures:
                        lecture_date_raw = str(lecture.get("planLecDate", ""))
                        lecture_date = parse_any_date(lecture_date_raw)
                        if lecture_date != today:
                            continue

                        status = str(lecture.get("attendance", "")).upper()
                        time_slot = str(lecture.get("timeSlot", ""))
                        subject_name = details.get("subject") or str(
                            todays_rows[todays_rows["course_code"] == course_code]["subject"].iloc[0]
                        )

                        if status in {"PRESENT", "ABSENT", "ADJUSTED"}:
                            marked_today_course_codes.add(str(course_code))

                        daywise_rows.append(
                            {
                                "Date": lecture_date.strftime("%Y-%m-%d"),
                                "Subject": subject_name,
                                "Course Code": course_code,
                                "Time Slot": time_slot,
                                "Attendance": status or "UNKNOWN",
                            }
                        )

                if daywise_rows:
                    st.dataframe(pd.DataFrame(daywise_rows), use_container_width=True)
                else:
                    st.info("No daywise attendance records found for today yet.")

                if marked_today_course_codes:
                    st.success(
                        "Today's marked subjects will be excluded from prediction: "
                        + ", ".join(sorted(marked_today_course_codes))
                    )
                else:
                    st.info("No marked attendance found yet for today's subjects.")
        except Exception as exc:
            st.error(f"Failed to fetch daywise attendance: {exc}")

st.header("4. Past Attendance & Corrections")

manual_extra_adjustments_by_code: dict[str, int] = {}

if "past_corrections_map" not in st.session_state:
    st.session_state["past_corrections_map"] = {}

if attendance_df.empty:
    st.info("Load attendance first to enable past attendance correction.")
elif not token:
    st.info("Past correction requires a valid portal token.")
else:
    max_past_date = today - timedelta(days=1)

    try:
        student_id = fetch_student_id(token)
        if student_id is None:
            st.warning("Could not determine studentId from API; cannot load past daywise records.")
        else:
            all_past_rows = collect_daywise_rows_for_range(
                token=token,
                student_id=student_id,
                attendance_map=attendance_map,
                start_date=date(2000, 1, 1),
                end_date=max_past_date,
                use_range=True,
            )

            if not all_past_rows:
                st.info("No past attendance records found in ERP.")
            else:
                daily_stats: dict[date, dict] = {}
                for row in all_past_rows:
                    d = row["Date"]
                    if d not in daily_stats:
                        daily_stats[d] = {
                            "date": d,
                            "lectures": [],
                            "total": 0,
                            "present": 0,
                            "absent": 0,
                            "adjusted": 0,
                        }
                    daily_stats[d]["lectures"].append(row)
                    daily_stats[d]["total"] += 1
                    status = str(row.get("Original Attendance", "")).strip().upper()
                    if status == "PRESENT":
                        daily_stats[d]["present"] += 1
                    elif status == "ABSENT":
                        daily_stats[d]["absent"] += 1
                    elif status == "ADJUSTED":
                        daily_stats[d]["adjusted"] += 1

                for d, info in daily_stats.items():
                    tot = info["total"]
                    abs_cnt = info["absent"]
                    pres_cnt = info["present"]
                    adj_cnt = info["adjusted"]
                    eff_pres = pres_cnt + adj_cnt
                    if abs_cnt == tot and tot > 0:
                        info["day_status"] = "FULL_ABSENT"
                    elif eff_pres == tot and tot > 0:
                        info["day_status"] = "FULL_PRESENT"
                    else:
                        info["day_status"] = "PARTIAL"

                full_day_absents = [
                    info for d, info in sorted(daily_stats.items(), key=lambda x: x[0], reverse=True)
                    if info["day_status"] == "FULL_ABSENT"
                ]

                available_months = sorted(
                    list({(d.year, d.month) for d in daily_stats.keys()}),
                    reverse=True,
                )

                active_map = dict(st.session_state.get("past_corrections_map", {}))

                tab_cal, tab_absents, tab_corrections = st.tabs([
                    "Calendar View",
                    f"Full-Day Absents ({len(full_day_absents)})",
                    "Table Corrections",
                ])

                with tab_cal:
                    st.subheader("Monthly Attendance Calendar")
                    cal_top_col1, cal_top_col2 = st.columns([1, 2])
                    with cal_top_col1:
                        if available_months:
                            selected_month_tuple = st.selectbox(
                                "Select Month",
                                options=available_months,
                                format_func=lambda ym: f"{calendar.month_name[ym[1]]} {ym[0]}",
                                key="past_cal_month_select",
                            )
                        else:
                            selected_month_tuple = (today.year, today.month)

                    selected_year, selected_month = selected_month_tuple
                    month_days_with_classes = [
                        d for d in daily_stats.keys()
                        if d.year == selected_year and d.month == selected_month
                    ]
                    month_full_absent = sum(
                        1 for d in month_days_with_classes if daily_stats[d]["day_status"] == "FULL_ABSENT"
                    )
                    month_full_present = sum(
                        1 for d in month_days_with_classes if daily_stats[d]["day_status"] == "FULL_PRESENT"
                    )
                    month_partial = sum(
                        1 for d in month_days_with_classes if daily_stats[d]["day_status"] == "PARTIAL"
                    )

                    with cal_top_col2:
                        m_col1, m_col2, m_col3, m_col4 = st.columns(4)
                        m_col1.metric("Class Days", len(month_days_with_classes))
                        m_col2.metric("Full Present", month_full_present)
                        m_col3.metric("Partial", month_partial)
                        m_col4.metric("Full Absent", month_full_absent)

                    cal_view_mode = st.radio(
                        "Calendar Display Format",
                        options=["Calendar Grid", "Month Breakdown Table"],
                        horizontal=True,
                        label_visibility="collapsed",
                        key="cal_view_mode_toggle",
                    )

                    if cal_view_mode == "Calendar Grid":
                        legend_html = (
                            '<div style="display: flex; gap: 16px; font-size: 12px; margin: 6px 0 14px 0; flex-wrap: wrap; align-items: center; padding: 8px 12px; background: rgba(148, 163, 184, 0.06); border-radius: 8px; border: 1px solid rgba(148, 163, 184, 0.15);">'
                            '<div style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #e11d48; display: inline-block;"></span><span style="font-weight: 500;">All Absent</span></div>'
                            '<div style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #d97706; display: inline-block;"></span><span style="font-weight: 500;">Partial</span></div>'
                            '<div style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #16a34a; display: inline-block;"></span><span style="font-weight: 500;">All Present</span></div>'
                            '<div style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #0284c7; display: inline-block;"></span><span style="font-weight: 500;">Adjusted</span></div>'
                            '<div style="display: inline-flex; align-items: center; gap: 6px;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #94a3b8; display: inline-block;"></span><span style="font-weight: 500; opacity: 0.7;">No Class / Weekend</span></div>'
                            '</div>'
                        )
                        render_html_safely(legend_html)

                        cal_html = render_calendar_html(
                            selected_year,
                            selected_month,
                            daily_stats,
                            today,
                            active_map,
                        )
                        render_html_safely(cal_html)
                    else:
                        month_table_rows = []
                        for d in sorted(month_days_with_classes, reverse=True):
                            d_info = daily_stats[d]
                            tot = d_info["total"]
                            pres = d_info["present"]
                            abs_c = d_info["absent"]
                            adj_c = d_info["adjusted"]
                            active_adj = sum(
                                1 for l in d_info["lectures"]
                                if bool(active_map.get(l.get("Lecture Key", ""), False)) and l.get("Can Adjust", False)
                            )
                            eff_pres = pres + adj_c + active_adj

                            if abs_c == tot and tot > 0:
                                status_label = "Adjusted" if active_adj == tot else "Full Absent"
                            elif eff_pres >= tot and tot > 0:
                                status_label = "Full Present"
                            else:
                                pct = round((eff_pres / tot) * 100) if tot else 0
                                status_label = f"Partial ({pct}%)"

                            subjs = ", ".join(sorted(set(l["Subject"] for l in d_info["lectures"])))
                            month_table_rows.append(
                                {
                                    "Date": d.strftime("%Y-%m-%d"),
                                    "Day": d.strftime("%A"),
                                    "Status": status_label,
                                    "Attended / Total": f"{eff_pres} / {tot}",
                                    "Missed Classes": max(0, tot - eff_pres),
                                    "Subjects": subjs,
                                }
                            )
                        st.dataframe(pd.DataFrame(month_table_rows), use_container_width=True)

                    if month_days_with_classes:
                        st.markdown("#### Inspect Day Schedule")
                        inspect_date = st.selectbox(
                            "Select date in this month to inspect classes:",
                            options=sorted(month_days_with_classes, reverse=True),
                            format_func=lambda d: f"{d.strftime('%A, %d %B %Y')} — {daily_stats[d]['day_status'].replace('_', ' ').title()}",
                            key="calendar_inspect_day_select",
                        )
                        if inspect_date and inspect_date in daily_stats:
                            day_info = daily_stats[inspect_date]
                            st.caption(
                                f"Showing all {day_info['total']} lectures on {inspect_date.strftime('%A, %d %B %Y')}:"
                            )
                            inspect_rows = []
                            for l in day_info["lectures"]:
                                key = l["Lecture Key"]
                                adj_status = (
                                    "Adjusted"
                                    if bool(active_map.get(key, False))
                                    else "Unadjusted"
                                )
                                inspect_rows.append(
                                    {
                                        "Time Slot": l["Time Slot"],
                                        "Course Code": l["Course Code"],
                                        "Subject": l["Subject"],
                                        "Original Status": l["Original Attendance"],
                                        "Can Adjust": "Yes" if l["Can Adjust"] else "No",
                                        "Adjustment Status": adj_status if l["Can Adjust"] else "-",
                                    }
                                )
                            st.dataframe(pd.DataFrame(inspect_rows), use_container_width=True)

                            day_missed_keys = [
                                l["Lecture Key"] for l in day_info["lectures"]
                                if l.get("Can Adjust", False)
                            ]
                            if day_missed_keys:
                                day_btn_col1, day_btn_col2 = st.columns(2)
                                with day_btn_col1:
                                    if st.button(
                                        f"Adjust Missed Lectures ({len(day_missed_keys)})",
                                        key=f"adj_day_{inspect_date}",
                                        use_container_width=True,
                                        type="primary",
                                    ):
                                        for k in day_missed_keys:
                                            active_map[k] = True
                                        st.session_state["past_corrections_map"] = active_map
                                        st.rerun()
                                with day_btn_col2:
                                    if st.button(
                                        "Clear Day Adjustments",
                                        key=f"clr_day_{inspect_date}",
                                        use_container_width=True,
                                    ):
                                        for k in day_missed_keys:
                                            active_map[k] = False
                                        st.session_state["past_corrections_map"] = active_map
                                        st.rerun()

                with tab_absents:
                    st.subheader("Days Absent for the Whole Day")
                    st.markdown(
                        "Below are all dates where you had classes scheduled and were marked "
                        "**ABSENT for every single class** on that day (e.g., leaves, mass bunks, sick days)."
                    )

                    fda_col1, fda_col2, fda_col3 = st.columns(3)
                    fda_col1.metric("Absent Days", f"{len(full_day_absents)} Days")
                    total_missed = sum(fda["total"] for fda in full_day_absents)
                    fda_col2.metric("Missed Lectures", f"{total_missed} Classes")

                    fully_adjusted_dates = []
                    for fda in full_day_absents:
                        all_adjusted = all(
                            bool(active_map.get(l["Lecture Key"], False))
                            for l in fda["lectures"]
                            if l.get("Can Adjust", False)
                        )
                        if all_adjusted and fda["total"] > 0:
                            fully_adjusted_dates.append(fda["date"])

                    fda_col3.metric(
                        "Adjusted Days",
                        f"{len(fully_adjusted_dates)} / {len(full_day_absents)} Days",
                    )

                    if not full_day_absents:
                        st.success("No full-day absences found in your recorded history.")
                    else:
                        st.markdown("---")
                        st.write("### Quick Adjustments")
                        st.caption(
                            "Select full-day absent dates below to mark all their missed lectures as adjusted in one click."
                        )

                        selected_fda_dates = st.multiselect(
                            "Select full-day absent dates to adjust:",
                            options=[fda["date"] for fda in full_day_absents],
                            default=fully_adjusted_dates,
                            format_func=lambda d: f"{d.strftime('%a, %d %b %Y')} ({daily_stats[d]['total']} classes missed: {', '.join(sorted(set(l['Course Code'] for l in daily_stats[d]['lectures'])))})",
                            key="full_day_absents_multiselect",
                        )

                        fda_btn_col1, fda_btn_col2, fda_btn_col3 = st.columns([1, 1, 1])
                        with fda_btn_col1:
                            if st.button("Apply Selected Adjustments", use_container_width=True, type="primary"):
                                for fda in full_day_absents:
                                    d = fda["date"]
                                    mark = d in selected_fda_dates
                                    for l in fda["lectures"]:
                                        if l.get("Can Adjust", False):
                                            active_map[l["Lecture Key"]] = mark
                                st.session_state["past_corrections_map"] = active_map
                                st.success(f"Updated adjustments for {len(selected_fda_dates)} whole-day absences.")
                                st.rerun()

                        with fda_btn_col2:
                            if st.button("Adjust All Full-Day Absents", use_container_width=True):
                                for fda in full_day_absents:
                                    for l in fda["lectures"]:
                                        if l.get("Can Adjust", False):
                                            active_map[l["Lecture Key"]] = True
                                st.session_state["past_corrections_map"] = active_map
                                st.success(
                                    f"Marked all {len(full_day_absents)} full-day absences ({total_missed} classes) as adjusted."
                                )
                                st.rerun()

                        with fda_btn_col3:
                            if st.button("Clear Full-Day Adjustments", use_container_width=True):
                                for fda in full_day_absents:
                                    for l in fda["lectures"]:
                                        if l.get("Can Adjust", False):
                                            active_map[l["Lecture Key"]] = False
                                st.session_state["past_corrections_map"] = active_map
                                st.info("Cleared adjustments for full-day absences.")
                                st.rerun()

                        st.markdown("---")
                        st.write("### Dates Overview")
                        fda_table_rows = []
                        for fda in full_day_absents:
                            d = fda["date"]
                            tot = fda["total"]
                            subjs = ", ".join(sorted(set(l["Subject"] for l in fda["lectures"])))
                            codes = ", ".join(sorted(set(l["Course Code"] for l in fda["lectures"])))
                            is_adj = d in fully_adjusted_dates
                            fda_table_rows.append(
                                {
                                    "Date": d.strftime("%Y-%m-%d"),
                                    "Day": d.strftime("%A"),
                                    "Missed Classes": tot,
                                    "Course Codes": codes,
                                    "Subjects": subjs,
                                    "Status": "Adjusted" if is_adj else "Absent",
                                }
                            )
                        st.dataframe(pd.DataFrame(fda_table_rows), use_container_width=True)

                        with st.expander("Inspect Classes per Absent Date"):
                            for fda in full_day_absents:
                                d = fda["date"]
                                is_adj = d in fully_adjusted_dates
                                status_tag = "Adjusted" if is_adj else "Absent"
                                st.markdown(
                                    f"**{d.strftime('%A, %d %B %Y')}** — {fda['total']} classes ({status_tag})"
                                )
                                lec_df = pd.DataFrame(
                                    [
                                        {
                                            "Time Slot": l["Time Slot"],
                                            "Course Code": l["Course Code"],
                                            "Subject": l["Subject"],
                                            "Original Status": l["Original Attendance"],
                                            "Adjusted": "Yes" if bool(active_map.get(l["Lecture Key"], False)) else "No",
                                        }
                                        for l in fda["lectures"]
                                    ]
                                )
                                st.dataframe(lec_df, use_container_width=True)

                with tab_corrections:
                    st.subheader("Detailed Attendance Records")
                    default_start = today - timedelta(days=30)
                    if default_start > max_past_date:
                        default_start = max_past_date

                    corr_col1, corr_col2 = st.columns(2)
                    with corr_col1:
                        correction_start = st.date_input(
                            "Past range start",
                            value=default_start,
                            key="past_range_start",
                        )
                    with corr_col2:
                        correction_end = st.date_input(
                            "Past range end",
                            value=max_past_date,
                            key="past_range_end",
                        )

                    past_date_options = sorted(list(daily_stats.keys()), reverse=True)
                    default_specific_days = [max_past_date] if max_past_date in past_date_options else []

                    specific_days = st.multiselect(
                        "Particular past days (optional)",
                        options=past_date_options,
                        default=default_specific_days,
                        format_func=lambda d: d.strftime("%d %b %Y"),
                        key="past_specific_days",
                        help="You can select multiple days. Range and selected days are combined.",
                    )

                    include_range = correction_start <= correction_end
                    effective_end = min(correction_end, max_past_date)
                    additional_dates = {d for d in specific_days if d < today}

                    filtered_rows = [
                        row for row in all_past_rows
                        if (include_range and correction_start <= row["Date"] <= effective_end)
                        or (row["Date"] in additional_dates)
                    ]

                    if not filtered_rows:
                        st.info("No past attendance records found for the selected range.")
                    else:
                        correction_df = pd.DataFrame(filtered_rows)
                        correction_df["Date"] = pd.to_datetime(correction_df["Date"]).dt.date
                        correction_df["Adjust Absent"] = correction_df.apply(
                            lambda r: (
                                bool(active_map.get(r["Lecture Key"], False))
                                if isinstance(active_map.get(r["Lecture Key"], False), bool)
                                else str(active_map.get(r["Lecture Key"], "")).strip().upper() == "ADJUSTED"
                            )
                            and bool(r["Can Adjust"]),
                            axis=1,
                        )

                        editor_df = correction_df[
                            [
                                "Date",
                                "Subject",
                                "Course Code",
                                "Time Slot",
                                "Original Attendance",
                                "Can Adjust",
                                "Adjust Absent",
                            ]
                        ].copy()

                        st.caption("Changes are applied only after clicking Apply Corrections.")

                        with st.form("past_attendance_corrections_form"):
                            edited_corrections = st.data_editor(
                                editor_df,
                                use_container_width=True,
                                num_rows="fixed",
                                column_config={
                                    "Date": st.column_config.DateColumn(disabled=True),
                                    "Subject": st.column_config.TextColumn(disabled=True),
                                    "Course Code": st.column_config.TextColumn(disabled=True),
                                    "Time Slot": st.column_config.TextColumn(disabled=True),
                                    "Original Attendance": st.column_config.TextColumn(disabled=True),
                                    "Can Adjust": st.column_config.TextColumn(
                                        "Can Adjust",
                                        disabled=True,
                                        help="Only ABSENT lectures can be adjusted.",
                                    ),
                                    "Adjust Absent": st.column_config.CheckboxColumn(
                                        "Adjust Absent",
                                        help="If checked, this absent lecture is counted as extra attendance.",
                                    ),
                                },
                                key="past_attendance_corrections_editor",
                            )
                            form_col1, form_col2 = st.columns(2)
                            with form_col1:
                                apply_corrections = st.form_submit_button(
                                    "Apply Corrections",
                                    use_container_width=True,
                                    type="primary",
                                )
                            with form_col2:
                                adjust_all_absents = st.form_submit_button(
                                    "Adjust All ABSENT in Filtered Table",
                                    use_container_width=True,
                                )

                        if adjust_all_absents:
                            for _, row in correction_df.iterrows():
                                lecture_key = str(row.get("Lecture Key", "")).strip()
                                can_adjust = bool(row.get("Can Adjust", False))
                                if lecture_key and can_adjust:
                                    active_map[lecture_key] = True

                            st.session_state["past_corrections_map"] = active_map
                            st.success("All ABSENT rows in current selection marked as adjusted.")
                            st.rerun()
                        elif apply_corrections:
                            edited_corrections = pd.DataFrame(edited_corrections).copy()
                            edited_corrections["Lecture Key"] = correction_df["Lecture Key"].values
                            edited_corrections.loc[
                                ~edited_corrections["Can Adjust"].astype(bool),
                                "Adjust Absent",
                            ] = False

                            for _, row in edited_corrections.iterrows():
                                lecture_key = str(row.get("Lecture Key", "")).strip()
                                adjusted = bool(row.get("Adjust Absent", False))
                                if lecture_key:
                                    active_map[lecture_key] = adjusted

                            st.session_state["past_corrections_map"] = active_map
                            st.success("Corrections applied.")
                            st.rerun()

                deltas: dict[str, int] = {}
                for row in all_past_rows:
                    course_code = str(row.get("Course Code", ""))
                    can_adjust = bool(row.get("Can Adjust", False))
                    lecture_key = str(row.get("Lecture Key", "")).strip()
                    raw_adjusted = active_map.get(lecture_key, False)
                    adjusted = (
                        bool(raw_adjusted)
                        if isinstance(raw_adjusted, bool)
                        else str(raw_adjusted).strip().upper() == "ADJUSTED"
                    )
                    if not course_code:
                        continue

                    if can_adjust and adjusted:
                        deltas[course_code] = deltas.get(course_code, 0) + 1

                manual_extra_adjustments_by_code = {
                    code: delta for code, delta in deltas.items() if delta != 0
                }

                if manual_extra_adjustments_by_code:
                    adjustments_rows = []
                    for code, delta in sorted(manual_extra_adjustments_by_code.items()):
                        details = attendance_map.get(code, {})
                        adjustments_rows.append(
                            {
                                "Course Code": code,
                                "Subject": details.get("subject", code),
                                "Extra Attendance Adjustment": delta,
                            }
                        )

                    st.subheader("Applied Past Adjustments (Total Across All Subjects)")
                    st.dataframe(pd.DataFrame(adjustments_rows), use_container_width=True)

                    base_present_sum = int(
                        sum(int(item.get("present", 0)) for item in attendance_map.values())
                    )
                    base_total_sum = int(
                        sum(int(item.get("total", 0)) for item in attendance_map.values())
                    )
                    extra_delta_sum = int(sum(manual_extra_adjustments_by_code.values()))
                    corrected_present_sum = max(0, base_present_sum + extra_delta_sum)
                    corrected_pct = (
                        (corrected_present_sum / base_total_sum) * 100 if base_total_sum else 0.0
                    )

                    adj_col1, adj_col2, adj_col3 = st.columns(3)
                    adj_col1.metric("Manual Extra Delta", f"+{extra_delta_sum} Classes")
                    adj_col2.metric("Corrected Current Present", corrected_present_sum)
                    adj_col3.metric("Corrected Current Attendance", f"{corrected_pct:.2f}%")
                else:
                    st.info("No extra-attendance change applied from past corrections.")
    except Exception as exc:
        st.error(f"Failed to load past attendance corrections: {exc}")

st.header("5. Predict Attendance")

if attendance_df.empty:
    st.warning("Load attendance data first.")
elif schedule_df.empty:
    st.warning("Load schedule data first (API or ICS) to run prediction.")
else:
    future_events = schedule_df[schedule_df["date"] >= today].copy()

    if marked_today_course_codes:
        future_events = future_events[
            ~(
                (future_events["date"] == today)
                & (future_events["course_code"].isin(marked_today_course_codes))
            )
        ].copy()

    if future_events.empty:
        st.info("No future classes available for projection.")
    else:
        holiday_dates = st.multiselect(
            "Mark holidays to exclude from projection",
            sorted(future_events["date"].unique()),
        )

        if holiday_dates:
            future_events = future_events[~future_events["date"].isin(holiday_dates)].copy()

        editor_columns = ["date", "subject", "course_code", "attend"]
        if "start" in future_events.columns:
            editor_columns.insert(3, "start")

        edited_events = st.data_editor(
            future_events[editor_columns].reset_index(drop=True),
            use_container_width=True,
            num_rows="fixed",
            column_config={
                "attend": st.column_config.CheckboxColumn(
                    "Attend",
                    default=True,
                    help="Uncheck to mark as missed class",
                )
            },
            key="future_attendance_editor",
        )

        projection_input = future_events.copy().reset_index(drop=True)
        projection_input["attend"] = pd.Series(edited_events["attend"], dtype=bool)

        projected_df = compute_projection(
            attendance_map,
            projection_input,
            manual_extra_adjustments_by_code=manual_extra_adjustments_by_code,
        )

        st.subheader("Projected Attendance Table")
        st.dataframe(
            projected_df[
                [
                    "Subject",
                    "Course Code",
                    "Credits",
                    "Extra Attendance",
                    "Present",
                    "Total",
                    "Percentage",
                    "Classes Needed for 60%",
                    "Classes Needed for 75%",
                ]
            ],
            use_container_width=True,
        )

        total_present = int(projected_df["Present"].sum())
        total_lectures = int(projected_df["Total"].sum())
        total_extra_attendance = int(projected_df["Extra Attendance"].sum())
        overall = (total_present / total_lectures) * 100 if total_lectures else 0.0

        col1, col2, col3, col4 = st.columns(4)
        col1.metric("Overall Total Lectures", total_lectures)
        col2.metric("Overall Total Present", total_present)
        col3.metric("Overall Attendance", f"{overall:.2f}%")
        col4.metric("Overall Extra Attendance", total_extra_attendance)
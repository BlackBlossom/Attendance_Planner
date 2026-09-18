# Attendance Planner (Python)

This project connects to KIET CyberVidya using your ERP token, fetches live attendance and schedule data, exports calendar, and predicts future attendance.

## Features

- Live attendance fetch from CyberVidya API
- Live class schedule fetch by date range
- Calendar export to `.ics`
- Attendance projection by marking future classes as attended/missed
- Target analysis for 60% and 75%
- Fallback uploads for attendance JSON and timetable ICS

## Project Structure

- `attendance_planner.py`: Main Streamlit app
- `API_TOKEN_DOCUMENTATION.md`: Full API and token mapping
- `requirements.txt`: Python dependencies
- `chrome/`: Chrome extension used to capture ERP token and redirect

## Setup

1. Create and activate a virtual environment (recommended).
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Run app:

```bash
streamlit run attendance_planner.py
```

By default, Streamlit opens on localhost (usually `http://localhost:8501`).

## Connect With ERP (Two Options)

### Option A: Manual token paste

1. Login to `https://kiet.cybervidya.net`.
2. Open browser devtools and read localStorage key `authenticationtoken`.
3. Paste token in app sidebar and click `Use Token`.

### Option B: Chrome extension redirect (recommended)

1. Open Chrome extensions page: `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked and select this folder:
   - `chrome/`
4. Start Streamlit app and open the app URL once.
5. Login to ERP and reach `/home`.
6. Extension redirects to your app with `?token=...` automatically.

## How Prediction Works

1. Load attendance (API or JSON upload).
2. Load schedule (API or ICS upload).
3. In the editor, uncheck classes you plan to miss.
4. App recalculates:
   - Subject-wise projected percentage
   - Classes needed for 60%
   - Classes needed for 75%
   - Overall attendance metrics

## Troubleshooting

- `Unauthorized token`:
  - Token expired. Re-login to ERP and fetch fresh `authenticationtoken`.
- No schedule events:
  - Expand start/end date range.
  - Confirm schedule API has classes for selected range.
- Extension not redirecting:
  - Confirm extension is loaded and permissions are granted.
  - Confirm ERP URL contains `kiet.cybervidya.net`.

## Security Notes

- Token is sensitive. Do not share it publicly.
- Avoid committing raw tokens in code, screenshots, or logs.

For endpoint-level details, see `API_TOKEN_DOCUMENTATION.md`.

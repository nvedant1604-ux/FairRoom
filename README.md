# FairRoom — Intelligent Housing Allocation System

**AI-Assisted Transparent Room Allocation System for Building Redevelopment**

This BSc IT final-year project supports fair and transparent room allocation through deterministic lottery logic, validation checks, building isolation, audit trails and AI-generated explanations. AI-style features assist the process; they do not secretly choose winners or provide legal approval.

## Main Features

- Secure admin Bearer-token authentication and protected routes
- Multi-building creation, selection, editing and archiving
- Building-specific residents, rooms, settings and audits
- Masked/hash-based Aadhaar/ID duplicate protection
- Resident verification, rejection, consent and history
- Controlled Preparing/Ready/In Progress/Completed draw cycles
- Resident and room eligibility selection
- Building-specific, versioned, transparent rule-based eligibility with hard rules, priority scores and resident previews
- Stored-seed deterministic priority/suitability allocation
- Full Allocation and Competitive Lottery modes, with optional deterministic waiting lists
- Multiple independent draw phases with immutable snapshots
- Fairness score and readable allocation explanations
- Draw history, audit logs, CSV/PDF reports and certificates
- Public building list and resident allocation search
- Lazy-loaded standard 2D Google Maps building location, marker, address lookup and external map links
- Isolated Playwright E2E suite: 21 passed, with Google-free deterministic map test mode
- Historical draw snapshots retain the exact criteria version and per-resident evaluation used before lottery selection

## Technology Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Lucide React, official Google Maps JavaScript API loader
- **Backend:** Python, FastAPI, Uvicorn
- **Database:** SQLite with idempotent migrations
- **Testing:** Playwright with Chromium

## Folder Structure

```text
FairRoom/
├── backend/
│   ├── app/                 FastAPI, database, fairness and reporting modules
│   ├── backups/             timestamped production database backups
│   ├── requirements.txt
│   └── lottery.db           local production/demo database
├── frontend/
│   ├── src/                 React application
│   ├── e2e/                 Playwright tests and server lifecycle
│   └── playwright.config.ts
├── docs/                    final college documentation package
└── README.md
```

## Installation

```powershell
cd "C:\Users\vedant\OneDrive\Desktop\Projects\FairRoom"
python -m pip install -r backend\requirements.txt

cd frontend
npm.cmd install
```

## Run Backend

```powershell
cd "C:\Users\vedant\OneDrive\Desktop\Projects\FairRoom"
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

API health: `http://127.0.0.1:8000/api/health`

## Run Frontend

```powershell
cd "C:\Users\vedant\OneDrive\Desktop\Projects\FairRoom\frontend"
npm.cmd run dev
```

Website: `http://127.0.0.1:5173`

## Google Maps Setup

Google Maps is optional and is disabled by default. The Dashboard and all lottery workflows continue to work without it.

1. Create a Google Cloud project, enable billing and enable the **Maps JavaScript API**. Address lookup also uses the Maps JavaScript API geocoding library.
2. Restrict the API key to the Maps JavaScript API and to the exact production HTTP referrers. Keep separate restricted keys for local development and production.
3. Copy `frontend/.env.example` to `frontend/.env` and set:

```dotenv
VITE_GOOGLE_MAPS_API_KEY=your_restricted_browser_key
VITE_GOOGLE_MAPS_ENABLED=true
VITE_GOOGLE_MAPS_TEST_MODE=false
```

`frontend/.env` is ignored by Git. Never put a real key in source, documentation, logs or test fixtures. Restart Vite after changing environment values. The integration loads only when the Dashboard or an open Add/Edit Building map is rendered. It provides roadmap/satellite views, zoom, pan, fullscreen and one building marker; it has no 3D, Street View, Directions API or Routes API features.

## Default Local Login

- Email: `admin@example.com`
- Password: `admin123`

Override with `AI_LOTTERY_ADMIN_EMAIL` and `AI_LOTTERY_ADMIN_PASSWORD`. These defaults are for local demonstration only and must be changed before deployment.

## Main Workflow

### Multi-Building

1. Log in and add/select a building.
2. Register and verify that building's residents.
3. Add that building's room inventory.
4. Switch buildings without mixing residents, rooms, locks, reports or audits.

### Multiple Draw Cycles

1. Create a named Draw Cycle.
2. Review resident and room eligibility.
3. Include verified unallocated residents and unused available rooms.
4. Confirm eligibility to mark the cycle Ready.
5. Run the seeded lottery.
6. Review immutable results, history, reports and certificate.
7. Create a later cycle without changing earlier completed draws.

### Eligibility Criteria

An authenticated administrator can open **Eligibility Criteria**, create a draft rule-set version for the selected building, add hard or priority rules, preview one resident or evaluate all residents, and activate the version. Hard-rule failures remove residents from the eligible pool. Priority-rule matches add an explainable score but do not select winners or change the existing seeded lottery order. Only resident fields that FairRoom stores can be used. No criteria configured means the existing verified-with-consent behavior applies.

An activated version is immutable. To change a policy, create a new draft version, optionally copying existing rules, then activate it. Draw confirmation stores the exact version, rules and resident evaluations. Draw History, Resident History and the Transparency Report read these historical records even after a later version is activated. This is a transparent rule-based engine, not a machine-learning decision model.

## Validation and Tests

```powershell
python -m compileall backend\app
python -m unittest discover -s backend\tests -v

cd frontend
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run test:e2e:report
```

Playwright starts backend port 8010 and frontend port 5174, uses one worker and sets `AI_LOTTERY_DB` to a temporary SQLite file under `frontend/test-results`. It does not modify `backend/lottery.db`.
It also sets `VITE_GOOGLE_MAPS_TEST_MODE=true`, renders a deterministic placeholder and makes no Google Maps requests.

## Documentation

- [Complete Project Report](docs/PROJECT_REPORT.md)
- [Project Synopsis](docs/PROJECT_SYNOPSIS.md)
- [System Architecture](docs/ARCHITECTURE.md)
- [Database Design](docs/DATABASE_DESIGN.md)
- [Lottery Algorithm](docs/LOTTERY_ALGORITHM.md)
- [AI Fairness Role](docs/AI_FAIRNESS_ROLE.md)
- [API Reference](docs/API_REFERENCE.md)
- [User Manual](docs/USER_MANUAL.md)
- [Administrator Demo Guide](docs/ADMIN_DEMO_GUIDE.md)
- [Test Report](docs/TEST_REPORT.md)
- [Security and Ethics](docs/SECURITY_AND_ETHICS.md)
- [Limitations and Future Scope](docs/LIMITATIONS_AND_FUTURE_SCOPE.md)
- [Viva Questions](docs/VIVA_QUESTIONS.md)
- [Presentation Content](docs/PRESENTATION_CONTENT.md)
- [Screenshot Checklist](docs/SCREENSHOT_CHECKLIST.md)

## Security and Production Limitations

The current application is a college MVP. SQLite, one demonstration administrator, local-storage token handling, manual document verification and simple PDF generation should be replaced or strengthened for a real concurrent deployment. Use HTTPS, PostgreSQL, password hashing or an identity provider, role-based accounts, managed secrets, monitoring, encrypted backups and independent security/legal review.

Full Aadhaar/ID values are not stored; the backend stores a masked value and normalized SHA-256 hash. This is duplicate protection, not official Aadhaar verification.

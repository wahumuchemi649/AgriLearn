# AgriLearn Kenya

A virtual farm for Kenyan classrooms, aligned to the Competency-Based Curriculum (CBC). Students run a compressed crop cycle (maize first), make the same decisions a farmer would, and see the consequences of their timing and choices on a 3D farm.

Real maize takes 3 to 5 months from bush clearing to harvest. AgriLearn compresses that into a pace a class can work through, without losing the part that matters: knowing *what* to do, *when*, and *how much*.

## Features

- **Compressed crop cycles** with a teacher-set pace. Virtual time follows real elapsed time, with pause and resume across lessons.
- **Two learning modes.** Guided is a locked-sequence demo for a learner's first cycle. Free unlocks every remaining stage in any order.
- **Decision-based scoring.** Timing windows, fertiliser type and rate, row and column spacing, and seeds per hole are all checked against syllabus-derived ideal ranges.
- **Visible plant health** across five states: Thriving, Healthy, Stressed, Stunted, Dead.
- **Data-driven crops.** Stages, timing windows, nutrient bands and fertiliser contents are database rows, so a new crop is data entry, not new code.
- **Solo or group play.** A cycle belongs to one student (revision) or one group within a class.
- **Planned:** AI tutor grounded in the CBC syllabus (RAG), competency scoring (EE / ME / AE / BE), and a teacher dashboard.

## How it works

### Time

There is no background ticker. Virtual day is computed on demand from real elapsed active time:

```
virtual_day = (active_seconds / 3600) x (crop.real_world_duration_days / cycle.real_duration_hours)
```

`real_duration_hours` is the pace chosen for the cycle (for example, 150 virtual days over 2 real hours). Pausing banks the elapsed time in `accumulated_active_seconds`, and resuming starts a new segment, so an idle or paused farm costs nothing.

### Modes

| Mode | Behaviour |
|---|---|
| **Guided** | Every stage is visible, but only the next correct one is enabled. Out-of-order submissions are rejected (HTTP 403). Health never changes, and mistakes are recorded as feedback only. |
| **Free** | All remaining stages are enabled. Mistakes reduce health. |

### Health

Health starts at 100 for every new cycle and only goes down. Correct actions are neutral.

| Mistake | Penalty (Free mode) |
|---|---|
| Action outside its timing window | -15 |
| Fertiliser rate too low or too high | -10 |
| Unrecognised fertiliser | -5 |
| Spacing outside the ideal planting-area band | -10 |
| Seeds per hole outside the ideal range | -5 |

State thresholds: 85+ Thriving, 65+ Healthy, 40+ Stressed, 15+ Stunted, below 15 Dead. Penalties are independent and additive, so feedback can separate a timing mistake from a decision-quality mistake.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, Tailwind CSS v4, Three.js, React Three Fiber, drei, Zustand |
| Backend | Django REST Framework |
| Database | PostgreSQL 17 with pgvector |
| Async | Celery and Redis (installed, used for tutor and report jobs) |
| AI tutor | LLM with RAG over the CBC syllabus (Anthropic API) |
| Reporting | WeasyPrint (PDF), Recharts (dashboards) |
| Auth | Django auth with `UserProfile`; SimpleJWT planned |

## Project structure

```
AgriLearn Kenya/
  Backend/
    manage.py
    .env                      # local only, never committed
    agrilearn_Backend/
      settings.py, urls.py
      Farm/                   # crops, stages, cycles, events, health, services
      Assessment/             # schools, classes, groups, user profiles, scores
      Tutor/                  # syllabus chunks (pgvector), tutor conversations
  Frontend/
    AgriLearn_Frontend/
      src/
        api/farm.js           # API client
        components/           # CreateCycle, FarmScreen, ...
```

Django apps live inside the project package, so imports use the prefix, for example `from agrilearn_Backend.Farm.models import Crops`.

## Getting started

### Prerequisites

- Python 3.12+ and Node.js 18+
- PostgreSQL 17 with the **pgvector** extension
- Redis (needed once Celery tasks are in use)

### 1. Database

Create the database and enable pgvector:

```sql
CREATE DATABASE agrilearn;
\c agrilearn
CREATE EXTENSION vector;
```

On native Windows, pgvector must be compiled against your exact Postgres install. From an administrator "x64 Native Tools Command Prompt for VS":

```
git clone --branch v0.7.0 https://github.com/pgvector/pgvector.git
cd pgvector
set PGROOT=C:\Program Files\PostgreSQL\17
nmake /F Makefile.win
nmake /F Makefile.win install
```

Alternatively, run the `pgvector/pgvector:pg16` Docker image and skip the compile.

### 2. Backend

```bash
cd Backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
```

Create `Backend/.env`:

```
DEBUG=True
SECRET_KEY=change-me
DB_NAME=agrilearn
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_HOST=localhost
DB_PORT=5432
```

Then:

```bash
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

### 3. Seed crop data

Maize needs these rows before a cycle can run (enter them in Django admin at `/admin/`):

1. `Crops`: Maize, `real_world_duration_days = 150`
2. `StageDefinition`: the maize stages with timing windows and `action_type`
3. `NutrientType`: Nitrogen
4. `FertilizerOption` and `FertlizerNutrientContent`: CAN and Urea with their nitrogen percentages
5. `CropNutrientRequirement`: the ideal nitrogen band for the top-dressing stage
6. `PlantingRequirement`: the ideal planting-area band for land marking, and the seeds-per-hole range for planting

### 4. Frontend

```bash
cd Frontend/AgriLearn_Frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The backend must be running on port 8000 with CORS allowing that origin.

## API

Base URL: `http://127.0.0.1:8000/api/farm`

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/cycles/` | Start a new cycle |
| GET | `/cycles/<id>/` | Current health, state and virtual day |
| GET | `/cycles/<id>/available-actions/` | Remaining stages, each with `enabled` |
| POST | `/cycles/<id>/actions/` | Submit a stage action (returns the new health) |

`POST /cycles/<id>/actions/` takes `stage_id` plus optional `fertilizer_name`, `application_rate`, `row_spacing_cm`, `column_spacing_cm` and `seeds_per_hole`, depending on the stage's `action_type`.

## Data model

- **Farm:** `Crops`, `StageDefinition`, `FarmCycle`, `CycleEVent`, `PlotHealthLog`, `NutrientType`, `CropNutrientRequirement`, `FertilizerOption`, `FertlizerNutrientContent`, `PlantingRequirement`
- **Assessment:** `School`, `UserProfile`, `Classes`, `Groups`, `Scores`
- **Tutor:** `SyllabusChunk`, `TutorConversation`

`StageDefinition.action_type` decides what a stage asks of the student and how it is scored: `LAND_PREP`, `SEED_SELECTION`, `SPACING_DECISION`, `PLANTING`, `FERTILIZER_APPLICATION`, `WEEDING`, `PEST_CONTROL`, `HARVEST`, `OTHER`. Stage-specific inputs (spacing, seeds) are stored in `CycleEVent.decision_details`.

## Service layer

All simulation logic lives in `Farm/services.py`; views only validate input and call it.

`crop_stages` -> `get_available_actions` -> `is_action_allowed` -> `record_action` -> `apply_action_consequences` -> `is_cycle_complete`, orchestrated by `submit_action`.

## Status

**Working:** schema and migrations on Postgres, the simulation engine, the four endpoints above, and a React UI that creates cycles and submits every action type with live health updates.

**In progress:** the 3D farm scene (Three.js, isometric camera) and the Guided / Free health rules.

**Next:** pause and resume endpoints, student and teacher auth, a crops-list endpoint, the AI tutor with RAG ingestion, competency scoring, the teacher dashboard, stage boundaries stored as percentages so they rescale with the chosen duration, and offline support (PWA).

## Conventions

- Field and model names follow what is in the code, including a few historical quirks: `Current_virtual_day` (capital C), `CycleEVent`, and `FertlizerNutrientContent`. Keep references exact.
- Never commit `.env`. Each developer runs their own local Postgres with their own credentials.
- New crops are added as data (stages, requirements, fertilisers), not as new code paths.

## Team

Final-year project, built by Wahu and a teammate.

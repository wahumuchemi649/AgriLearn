# AgriLearn Kenya

A virtual farm for Kenyan classrooms, aligned to the Competency-Based Curriculum (CBC). Students run a compressed crop cycle (maize first), make the same decisions a farmer would, and see the consequences of their timing and choices on a 3D farm. A built-in tutor answers their questions in English or Kiswahili, by typing or by voice.

Real maize takes 3 to 5 months from bush clearing to harvest. AgriLearn compresses that into a pace a class can work through, without losing the part that matters: knowing *what* to do, *when*, and *how much*.

## Features

- **Compressed crop cycles** with a teacher-set pace. Virtual time follows real elapsed time, with pause and resume across lessons.
- **Two learning modes.** Guided is a locked-sequence demo for a learner's first cycle. Free unlocks every remaining stage in any order.
- **Decision-based scoring.** Timing windows, fertiliser type and rate, row and column spacing, and seeds per hole are all checked against syllabus-derived ideal ranges.
- **Visible plant health** across five states: Thriving, Healthy, Stressed, Stunted, Dead.
- **Data-driven crops.** Stages, timing windows, nutrient bands, fertiliser contents and tutor notes are database rows or data files, so a new crop is data entry, not new code.
- **Solo or group play.** A cycle belongs to one student (revision) or one group within a class.
- **Farm tutor (AI).** Answers questions grounded in the CBC syllabus notes, in English or Kiswahili, with typed or spoken questions and read-aloud answers. Works inside a running farm and as a standalone chat.
- **Auth.** JWT sign-in for students and groups, with silent token renewal.
- **Planned:** competency scoring (EE / ME / AE / BE), teacher dashboard, server-side tutor audio.

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

### The tutor

Gemini does not know your crops. It only knows what the database hands it on each question.

1. **Embed.** The question is turned into a 768-number vector with Gemini's embedding model.
2. **Search.** Postgres (pgvector) finds the closest syllabus notes. A farm cycle only searches its own crop's notes. A general chat searches all crops.
3. **Answer.** The rules, matched notes, farm snapshot (cycle chats only), recent history and the question go to Gemini, which rewrites the notes for a 10 to 14 year old.

**Two chat contexts, one component**

| Context | Where | What the tutor knows |
|---|---|---|
| Cycle chat | Drawer on the farm screen | Syllabus notes plus a snapshot of the cycle: mode, virtual day, open stages, health, status |
| General chat | `/tutor` page | Syllabus notes only. Students use it to revise or think out loud |

**Answer rules (the middle path)**

- Every number, date, amount, timing and recommendation must come from the syllabus notes or the farm snapshot. Gemini never invents them.
- It may explain a general concept (what nitrogen does, why plants compete) even when the notes are silent. Those answers start with "From general knowledge:" (Kiswahili: "Kutoka maarifa ya jumla:").
- If a question needs a number or recommendation the notes don't give, it says so and sends the learner to their teacher.
- Off-topic questions get a fixed refusal, in English or Kiswahili, and are not saved to history.
- Free mode: hints and guiding questions, never the exact answer for the current task. Scores and penalties are never mentioned.
- Replies are in the language the question was asked in.

**Distance thresholds.** `MAX_DISTANCE` (0.38) decides which notes count as a direct match and are given to Gemini as sources. Embedding distances for farming and off-topic questions sit close together, so distance does not filter off-topic questions. The prompt does that. `RELATED_DISTANCE` is set to 1.0 (effectively off). Revisit both once the syllabus has many more notes.

**Resilience**

- `Llm.generate` tries the main model, then a fallback model, when Google returns 503, 429, 504, a timeout or a retired-model 404.
- If both fail, the student sees the closest note as written (amber bubble). That fallback is not saved to history.
- Greetings ("hi", "habari", "sasa"...) get a bilingual reply without an API call.
- Only real answers and the "no notes" reply are saved to history.

### Voice and language

- **Speaking a question:** browser speech recognition (Chrome, Edge, Android Chrome). It cannot detect the language, so the student picks English or Kiswahili in the dropdown first. Typing works in either language regardless of the dropdown.
- **Listening to an answer:** browser speech synthesis. The voice follows the answer's language, and the panel prefers natural or online voices when the device has them.
- **Known limit:** many devices have no Kiswahili voice installed, so Swahili is read with an English accent. Edge (Natural voices) and Android (Text-to-speech settings) are the best options today. The planned fix is server-side audio, so every device plays the same voice.
- **HTTPS:** the microphone needs HTTPS or `localhost`.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, Tailwind CSS v4, Three.js, React Three Fiber, drei, Zustand, React Router |
| Backend | Django REST Framework |
| Database | PostgreSQL 17 with pgvector |
| Async | Celery and Redis (installed, planned for report jobs) |
| AI tutor | Google Gemini via the `google-genai` SDK: `gemini-embedding-001` (768 dimensions) for search, a Gemini model for answers with a lighter fallback model |
| Voice | Web Speech API (recognition and synthesis) |
| Reporting | WeasyPrint (PDF), Recharts (dashboards) |
| Auth | Django auth with `UserProfile`; SimpleJWT (access and refresh tokens) |

## Project structure

```
AgriLearn Kenya/
  Backend/
    manage.py
    .env                      # local only, never committed
    agrilearn_Backend/
      settings.py, urls.py
      Farm/                   # crops, stages, cycles, events, health, services, debrief
      Assessment/             # schools, classes, groups, user profiles, scores, auth
      Tutor/
        models.py             # SyllabusChunk (pgvector), TutorConversation
        services.py           # search, prompts, answer logic
        Llm.py                # Gemini embeddings and generation, fallback model
        views.py, urls.py     # /ask/ and /history/
        syllabus_examples.json
        management/commands/ingest_syllabus.py
  Frontend/
    AgriLearn_Frontend/
      src/
        api/                  # farm.js, auth.js, tutor.js
        components/           # CreateCycle, FarmScreen, TutorPanel, TutorPage, TutorDrawer, ...
        farm/                 # store, 3D scene, action panel
```

Django apps live inside the project package, so imports use the prefix, for example `from agrilearn_Backend.Farm.models import Crops`.

## Getting started

### Prerequisites

- Python 3.12+ and Node.js 18+
- PostgreSQL 17 with the **pgvector** extension
- A Gemini API key (Google AI Studio)
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

`requirements.txt` must include `google-genai` (not the older `google-generativeai`, which is a different package). Install with `python -m pip install google-genai` so it lands in the same Python that runs the server.

Create `Backend/.env`:

```
DEBUG=True
SECRET_KEY=change-me
DB_NAME=agrilearn
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_HOST=localhost
DB_PORT=5432
GEMINI_API_KEY=your_gemini_key
# Optional: override the fallback model used when the main one is busy
GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite
```

Model names change. If a model returns 404 NOT_FOUND, use a current name from Google AI Studio.

Add a throttle rate for the tutor in `settings.py`, inside the existing `REST_FRAMEWORK` dict:

```python
"DEFAULT_THROTTLE_RATES": {
    # keep your existing scopes
    "tutor": "20/min",
},
```

Make sure the project `urls.py` includes every app, with trailing slashes on the prefixes:

```python
path("api/farm/", include("agrilearn_Backend.Farm.urls")),
path("api/tutor/", include("agrilearn_Backend.Tutor.urls")),
path("api/", include("agrilearn_Backend.Assessment.urls")),
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

List the stage orders (the tutor notes attach to these) in the Django shell:

```python
from agrilearn_Backend.Farm.models import StageDefinition
for s in StageDefinition.objects.select_related("crop").order_by("crop__name", "order"):
    print(s.crop.name, "|", s.order, "|", s.stage_name, "|", s.action_type)
```

### 4. Load the tutor's syllabus notes

Each note is one idea in 2 to 5 sentences, attached to a crop and a stage:

```json
[
  {
    "crop": "Maize",
    "stage_order": 10,
    "topic": "Maize: first weeding",
    "content": "The first weeding removes weeds while the maize is still small. Weeds grow fast and take water, light and nutrients from young maize."
  }
]
```

- `crop` must match the crop name in admin exactly.
- `stage_order` must match a `StageDefinition.order` for that crop.
- Start each `topic` with the crop name, so notes stay distinguishable in general chat once more crops exist.
- Keep notes free of numbers unless they come from the CBC material. The tutor repeats whatever the notes say.

Run from `Backend`:

```bash
python manage.py ingest_syllabus agrilearn_Backend\Tutor\syllabus_examples.json
```

It is safe to run again: matching notes are updated, not duplicated. Check the result:

```python
from agrilearn_Backend.Tutor.models import SyllabusChunk
print(SyllabusChunk.objects.count(), SyllabusChunk.objects.exclude(embedding=None).count())
```

Both numbers should be equal and above 0. If the embedding model or dimension ever changes, re-ingest everything.

**Adding a new crop:** add the crop and stages in admin, write its notes file, run the ingest. No code changes. Until a crop has notes, its cycles get a "no notes" message and never reach Gemini.

### 5. Frontend

```bash
cd Frontend/AgriLearn_Frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The backend must be running on port 8000 with CORS allowing that origin and the `Authorization` header.

| Route | Screen |
|---|---|
| `/login`, `/signup` | Sign in or register |
| `/` | Create a cycle |
| `/farm/:cycleId` | The 3D farm, with the tutor drawer |
| `/farm/:cycleId/debrief` | End-of-cycle debrief |
| `/tutor` | Standalone tutor chat |

## API

Base URL: `http://127.0.0.1:8000/api`. All farm and tutor endpoints need a JWT (`Authorization: Bearer ...`).

### Farm (`/farm`)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/cycles/` | Start a new cycle |
| GET | `/cycles/<id>/` | Current health, state and virtual day |
| GET | `/cycles/<id>/available-actions/` | Remaining stages, each with `enabled` |
| POST | `/cycles/<id>/actions/` | Submit a stage action (returns the new health) |

`POST /cycles/<id>/actions/` takes `stage_id` plus optional `fertilizer_name`, `application_rate`, `row_spacing_cm`, `column_spacing_cm` and `seeds_per_hole`, depending on the stage's `action_type`.

### Auth

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/auth/login/` | Returns access token, refresh token and actor |
| POST | `/auth/register/` | Create a student account |
| POST | `/auth/refresh/` | Renew an expired access token |

### Tutor (`/tutor`)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/ask/` | Ask a question. Body: `question` and optional `cycle_id`. No `cycle_id` means general chat |
| GET | `/history/` | The caller's general-chat history |
| GET | `/history/<cycle_id>/` | History for one cycle |

Rules: students and groups only (teachers get 403), throttled under the `tutor` scope, questions capped at 500 characters, a cycle that isn't yours returns 404 (never 403), and history is scoped to the student or group so chats never leak between owners.

`/ask/` returns `answer`, `sources` (note topics used), `source` (`ai` or `fallback`), and for AI answers `basis` (`notes` or `general`). Only real answers and the "no notes" reply are saved.

## Data model

- **Farm:** `Crops`, `StageDefinition`, `FarmCycle`, `CycleEVent`, `PlotHealthLog`, `NutrientType`, `CropNutrientRequirement`, `FertilizerOption`, `FertlizerNutrientContent`, `PlantingRequirement`
- **Assessment:** `School`, `UserProfile`, `Classes`, `Groups`, `Scores`
- **Tutor:** `SyllabusChunk` (crop, stage, topic, content, 768-dimension embedding), `TutorConversation` (`user` or `group`, optional `cycle`, question, answer, timestamp)

`StageDefinition.action_type` decides what a stage asks of the student and how it is scored: `LAND_PREP`, `SEED_SELECTION`, `SPACING_DECISION`, `PLANTING`, `FERTILIZER_APPLICATION`, `WEEDING`, `PEST_CONTROL`, `HARVEST`, `OTHER`. Stage-specific inputs (spacing, seeds) are stored in `CycleEVent.decision_details`.

## Service layer

All simulation logic lives in `Farm/services.py`; views only validate input and call it.

`crop_stages` -> `get_available_actions` -> `is_action_allowed` -> `record_action` -> `apply_action_consequences` -> `is_cycle_complete`, orchestrated by `submit_action`.

The tutor follows the same split: `Tutor/services.py` holds the search, prompts and answer logic, `Tutor/Llm.py` holds the Gemini calls, and the views only validate input, check ownership and save history.

## Status

**Working:** schema and migrations on Postgres, the simulation engine, the farm endpoints, a React UI that creates cycles and submits every action type with live health updates, JWT auth, the debrief screen, and the tutor end to end (syllabus ingest, vector search, grounded answers, general chat, Kiswahili replies, typed and voice questions, read-aloud, model fallback).

**In progress:**
- The 3D farm scene (Three.js, isometric camera) and the Guided / Free health rules.
- The tutor drawer on the farm screen (the component exists; mount it once inside `FarmScreen`'s returned JSX, passing `Number(cycleId)`).
- Syllabus notes: the current file has one starter note per maize stage and needs real CBC detail (depths, timings, rates, pests).
- Kiswahili answer quality: have a Swahili-speaking teacher review the wording. If it is stiff, write Swahili versions of key notes.

**Next:**
- Server-side tutor audio so Kiswahili sounds right on every device.
- "Ask about this stage" shortcut, and feeding richer farm state (recent mistakes) into the cycle prompt.
- A grounded flag on conversations, so teachers can see which questions the notes could not answer.
- Pause and resume endpoints, a crops-list endpoint, competency scoring, the teacher dashboard, stage boundaries stored as percentages so they rescale with the chosen duration, and offline support (PWA).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Tutor URLs return 404 | `api/tutor/` include missing from the project `urls.py`, or a prefix without a trailing slash |
| Tutor returns 401 | Not logged in, or both tokens expired. The tutor uses `authFetch` from the auth client |
| 500 on `/ask/`: "No default throttle rate set for 'tutor'" | Add `"tutor": "20/min"` to `DEFAULT_THROTTLE_RATES` |
| "cannot import name 'genai' from 'google'" | Run `python -m pip install google-genai`, then restart the server |
| Always the amber "can't be reached" or note-only bubble | Check the terminal for `Gemini ... failed`. 503 and 504 are Google overload, 404 means a retired model name |
| Always "I don't have notes on that yet" | The syllabus isn't ingested, or the crop has no notes |
| Swahili sounds like English | The device has no Kiswahili voice. Try Edge, or install one in Android settings |

## Conventions

- Field and model names follow what is in the code, including a few historical quirks: `Current_virtual_day` (capital C), `CycleEVent`, and `FertlizerNutrientContent`. Keep references exact.
- Never commit `.env`. Each developer runs their own local Postgres with their own credentials and Gemini key.
- New crops are added as data (stages, requirements, fertilisers, syllabus notes), not as new code paths.
- The tutor never states a number, timing or recommendation that is not in the notes or the farm snapshot.

## Team

Final-year project, built by Wahu Muchemi and Dorcas Kipyegon.
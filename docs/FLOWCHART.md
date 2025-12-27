# Git-Doc System Architecture & Process Flow

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            GIT-DOC ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────────────────┐  │
│  │   Next.js    │      │    Rust      │      │        MySQL             │  │
│  │   Frontend   │◄────►│   Service    │◄────►│       Database           │  │
│  │  (Port 4000) │      │ (Port 8080)  │      │                          │  │
│  └──────────────┘      └──────────────┘      └──────────────────────────┘  │
│        │                      │                        ▲                    │
│        │                      │                        │                    │
│        ▼                      ▼                        │                    │
│  ┌──────────────┐      ┌──────────────┐               │                    │
│  │   Browser    │      │  Git Repos   │               │                    │
│  │    User      │      │   (Clone)    │               │                    │
│  └──────────────┘      └──────────────┘               │                    │
│                                                        │                    │
│                         ┌──────────────┐               │                    │
│                         │   Prisma     │───────────────┘                    │
│                         │    ORM       │                                    │
│                         └──────────────┘                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Models (ERD)

```
┌─────────────────────┐       ┌─────────────────────┐
│     Credential      │       │     Repository      │
├─────────────────────┤       ├─────────────────────┤
│ id (PK)             │       │ id (PK)             │
│ name                │◄──────│ credentialId (FK)   │
│ type (PAT/SSH/OAUTH)│       │ name                │
│ username            │       │ url                 │
│ token               │       │ branch              │
│ sshKeyPath          │       │ localPath           │
│ createdAt           │       │ lastSyncAt          │
│ updatedAt           │       │ createdAt           │
└─────────────────────┘       │ updatedAt           │
                              └──────────┬──────────┘
                                         │
                                         │ 1:N
                                         ▼
                              ┌─────────────────────┐
                              │       Commit        │
                              ├─────────────────────┤
                              │ id (PK)             │
                              │ repositoryId (FK)   │
                              │ sha                 │
                              │ authorName          │
                              │ authorEmail         │
                              │ commitDate          │
                              │ message             │
                              │ messageTitle        │
                              │ filesChanged        │
                              │ changedPaths        │
                              │ summary (AI)        │
                              │ summaryStatus       │
                              │ jiraKey             │
                              │ jiraUrl             │
                              └─────────────────────┘

┌─────────────────────┐       ┌─────────────────────┐
│    AnalysisJob      │       │     ExportJob       │
├─────────────────────┤       ├─────────────────────┤
│ id (PK)             │       │ id (PK)             │
│ repositoryId        │       │ status              │
│ status              │       │ startDate           │
│ startDate           │       │ endDate             │
│ endDate             │       │ authorEmail         │
│ authorFilter        │       │ repoIds             │
│ totalCommits        │       │ fileName            │
│ processedCommits    │       │ fileKey             │
│ error               │       │ fileSize            │
│ createdAt           │       │ rowCount            │
│ completedAt         │       │ progress            │
└─────────────────────┘       │ error               │
                              └─────────────────────┘
```

---

## Process 1: Add Credentials

```
┌─────────────────────────────────────────────────────────────────┐
│                    ADD CREDENTIALS FLOW                         │
└─────────────────────────────────────────────────────────────────┘

     ┌─────────┐
     │  User   │
     └────┬────┘
          │
          ▼
┌─────────────────────┐
│  /credentials/new   │  ◄── Next.js Page
│     (Browser)       │
└─────────┬───────────┘
          │
          │  POST /api/credentials
          │  { name, type, token, ... }
          ▼
┌─────────────────────┐
│  API Route Handler  │  ◄── src/app/api/credentials/route.ts
│  - Validate input   │
│  - Store in DB      │
└─────────┬───────────┘
          │
          │  prisma.credential.create()
          ▼
┌─────────────────────┐
│    MySQL Database   │
│  Credential Table   │
└─────────────────────┘
```

---

## Process 2: Add Repository

```
┌─────────────────────────────────────────────────────────────────┐
│                    ADD REPOSITORY FLOW                          │
└─────────────────────────────────────────────────────────────────┘

     ┌─────────┐
     │  User   │
     └────┬────┘
          │
          │  Enter: name, URL, branch, credential
          ▼
┌─────────────────────┐
│    /repos/new       │
│    (Browser)        │
└─────────┬───────────┘
          │
          │  POST /api/repos
          │  { name, url, branch, credentialId }
          ▼
┌─────────────────────┐
│  API Route Handler  │
│  - Validate URL     │
│  - Check duplicate  │
│  - Store in DB      │
└─────────┬───────────┘
          │
          │  prisma.repository.create()
          ▼
┌─────────────────────┐
│    MySQL Database   │
│  Repository Table   │
└─────────────────────┘
```

---

## Process 3: Analyze Repository (Main Flow)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ANALYZE REPOSITORY FLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────┐
│  User   │
└────┬────┘
     │
     │  Select: repo, dateRange, authors[]
     ▼
┌─────────────────────┐
│    /analyze         │  ◄── src/app/analyze/page.tsx
│    (Browser)        │
│  - Select repo      │
│  - Date range       │
│  - Multi-author     │
└─────────┬───────────┘
          │
          │  POST /api/analyze
          │  { repositoryId, startDate, endDate, authorFilter }
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NEXT.JS API HANDLER                          │
│                 src/app/api/analyze/route.ts                    │
├─────────────────────────────────────────────────────────────────┤
│  1. Validate request (zod)                                      │
│  2. Find repository + credential                                │
│  3. Create AnalysisJob (status: PENDING)                        │
│  4. Call Rust service (async, non-blocking)                     │
│  5. Return job ID immediately                                   │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      │  POST http://localhost:8080/analyze
                      │  { jobId, repoUrl, branch, token, filters }
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      RUST SERVICE                               │
│                  rust-service/src/main.rs                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  STEP 1: CLONING                                        │   │
│  │  ────────────────                                        │   │
│  │  - Update job status → CLONING                          │   │
│  │  - Clone repo to /tmp/git-doc-repos/                    │   │
│  │  - OR fetch if already exists                           │   │
│  │  - Use credential token for authentication              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          │                                      │
│                          ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  STEP 2: PARSING                                        │   │
│  │  ───────────────                                        │   │
│  │  - Update job status → PARSING                          │   │
│  │  - Walk git history (revwalk)                           │   │
│  │  - Filter by date range                                 │   │
│  │  - Filter by authors (comma-separated, multi-select)    │   │
│  │  - Extract: sha, author, date, message, changed files   │   │
│  │  - Extract JIRA key from message (regex)                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          │                                      │
│                          ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  STEP 3: STORING                                        │   │
│  │  ───────────────                                        │   │
│  │  - For each commit:                                     │   │
│  │    - Check if exists (skip if duplicate)                │   │
│  │    - Sanitize strings for MySQL                         │   │
│  │    - INSERT INTO Commit table                           │   │
│  │    - Update processedCommits count                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          │                                      │
│                          ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  STEP 4: COMPLETE                                       │   │
│  │  ────────────────                                       │   │
│  │  - Update job status → COMPLETED                        │   │
│  │  - Update repository.lastSyncAt                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

                      ▲
                      │  Poll every 2s
                      │  GET /api/analyze?jobId=xxx
┌─────────────────────┴───────────────────────────────────────────┐
│                    FRONTEND POLLING                             │
│               (useEffect with interval)                         │
├─────────────────────────────────────────────────────────────────┤
│  - Display progress bar                                         │
│  - Show: processedCommits / totalCommits                        │
│  - Show status: CLONING → PARSING → COMPLETED                   │
│  - Stop polling when COMPLETED or FAILED                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Process 4: Preview Analyzed Commits

```
┌─────────────────────────────────────────────────────────────────┐
│                    PREVIEW COMMITS FLOW                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────┐
│  User   │
└────┬────┘
     │
     │  Select repo, filter authors
     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      /preview                                   │
│                  src/app/preview/page.tsx                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────┐      ┌─────────────────────┐          │
│  │  Repository List    │      │   Author Filter      │          │
│  │  (clickable cards)  │      │   (multi-select)     │          │
│  └─────────┬───────────┘      └─────────┬───────────┘          │
│            │                            │                       │
│            │  GET /api/repos            │  GET /api/authors     │
│            ▼                            ▼     ?repoId=xxx       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                     API Calls                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            │  GET /api/commits                  │
│                            │  ?repoId=xxx                       │
│                            │  &authorEmails=a@x.com,b@y.com     │
│                            │  &page=1&limit=20                  │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Commits List                           │   │
│  │  ┌───────────────────────────────────────────────────┐  │   │
│  │  │ • SHA badge  • Status badge  • JIRA badge         │  │   │
│  │  │ • Commit title                                     │  │   │
│  │  │ • Author, Date, Files count                        │  │   │
│  │  │ ─────────────────────────────────────────────────  │  │   │
│  │  │ [Expandable] Full message, AI Summary, JIRA link   │  │   │
│  │  └───────────────────────────────────────────────────┘  │   │
│  │                                                          │   │
│  │  ┌─────────────┐  ┌─────────────┐                       │   │
│  │  │  ← Prev     │  │   Next →    │  Pagination           │   │
│  │  └─────────────┘  └─────────────┘                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Process 5: Export to Excel

```
┌─────────────────────────────────────────────────────────────────┐
│                    EXPORT TO EXCEL FLOW                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────┐
│  User   │
└────┬────┘
     │
     │  Select: repos, dateRange, authors[]
     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    /exports/new                                 │
│               src/app/exports/new/page.tsx                      │
├─────────────────────────────────────────────────────────────────┤
│  - Multi-select repositories (checkboxes)                       │
│  - Date range picker                                            │
│  - Multi-select authors (pill/chip UI)                          │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      │  POST /api/export
                      │  { repoIds[], startDate, endDate, authorEmails[] }
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                  EXPORT API HANDLER                             │
│               src/app/api/export/route.ts                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Parse & validate request (zod)                              │
│                      │                                          │
│                      ▼                                          │
│  2. Build Prisma query                                          │
│     - Filter by repositoryId IN [...]                           │
│     - Filter by authorEmail IN [...]                            │
│     - Filter by commitDate BETWEEN start AND end                │
│                      │                                          │
│                      ▼                                          │
│  3. Fetch commits from database                                 │
│     prisma.commit.findMany({ where, include: { repository } })  │
│                      │                                          │
│                      ▼                                          │
│  4. Generate Excel with ExcelJS                                 │
│     ┌─────────────────────────────────────────────────────────┐│
│     │  Excel Columns:                                         ││
│     │  ───────────────                                        ││
│     │  • Date Time      - Commit timestamp                    ││
│     │  • Repository     - Repo name                           ││
│     │  • Summary        - AI-generated summary                ││
│     │  • Commit Name    - First line of message               ││
│     │  • Description    - Full commit message                 ││
│     │  • Commit Code    - SHA (short)                         ││
│     │  • Changed Files  - List of file paths                  ││
│     │  • Files Count    - Number of files changed             ││
│     │  • JIRA Link      - Extracted JIRA URL                  ││
│     │  • Author         - Name <email>                        ││
│     └─────────────────────────────────────────────────────────┘│
│                      │                                          │
│                      ▼                                          │
│  5. Record export in ExportJob table                            │
│                      │                                          │
│                      ▼                                          │
│  6. Return Excel buffer as download                             │
│     Content-Type: application/vnd.openxmlformats-...            │
│     Content-Disposition: attachment; filename="..."             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                      │
                      ▼
              ┌───────────────┐
              │  .xlsx File   │  ◄── Browser downloads
              │   Download    │
              └───────────────┘
```

---

## Job Status State Machine

```
┌─────────────────────────────────────────────────────────────────┐
│                 ANALYSIS JOB STATUS FLOW                        │
└─────────────────────────────────────────────────────────────────┘

                    ┌─────────┐
                    │ PENDING │
                    └────┬────┘
                         │
                         │  Rust service starts
                         ▼
                    ┌─────────┐
                    │ CLONING │
                    └────┬────┘
                         │
                         │  Clone/fetch complete
                         ▼
                    ┌─────────┐
                    │ PARSING │
                    └────┬────┘
                         │
                    ┌────┴────┐
                    │         │
                    ▼         ▼
             ┌───────────┐  ┌────────┐
             │ COMPLETED │  │ FAILED │
             └───────────┘  └────────┘


┌─────────────────────────────────────────────────────────────────┐
│                 SUMMARY STATUS FLOW                             │
└─────────────────────────────────────────────────────────────────┘

              ┌─────────┐
              │ PENDING │  ◄── Initial state
              └────┬────┘
                   │
                   │  AI summary requested
                   ▼
            ┌────────────┐
            │ PROCESSING │
            └─────┬──────┘
                  │
             ┌────┴────┐
             │         │
             ▼         ▼
       ┌───────────┐  ┌────────┐
       │ COMPLETED │  │ FAILED │
       └───────────┘  └────────┘
```

---

## API Endpoints Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                      API ENDPOINTS                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CREDENTIALS                                                    │
│  ───────────                                                    │
│  GET  /api/credentials      - List all credentials              │
│  POST /api/credentials      - Create credential                 │
│  PUT  /api/credentials/:id  - Update credential                 │
│  DEL  /api/credentials/:id  - Delete credential                 │
│                                                                 │
│  REPOSITORIES                                                   │
│  ────────────                                                   │
│  GET  /api/repos            - List all repositories             │
│  POST /api/repos            - Create repository                 │
│  PUT  /api/repos/:id        - Update repository                 │
│  DEL  /api/repos/:id        - Delete repository                 │
│                                                                 │
│  ANALYSIS                                                       │
│  ────────                                                       │
│  GET  /api/analyze          - Get job status / list jobs        │
│  POST /api/analyze          - Start analysis job                │
│                                                                 │
│  AUTHORS                                                        │
│  ───────                                                        │
│  GET  /api/authors          - Get unique authors                │
│       ?repoId=xxx           - Filter by repository              │
│                                                                 │
│  COMMITS                                                        │
│  ───────                                                        │
│  GET  /api/commits          - List commits with filters         │
│       ?repoId=xxx                                               │
│       &authorEmails=a,b,c   - Multiple authors                  │
│       &startDate=yyyy-mm-dd                                     │
│       &endDate=yyyy-mm-dd                                       │
│       &page=1&limit=50                                          │
│                                                                 │
│  EXPORT                                                         │
│  ──────                                                         │
│  GET  /api/export           - List previous exports             │
│  POST /api/export           - Generate Excel file               │
│                                                                 │
│  RUST SERVICE (Port 8080)                                       │
│  ────────────────────────                                       │
│  GET  /health               - Health check                      │
│  POST /analyze              - Process analysis job              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                      TECHNOLOGY STACK                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  FRONTEND                                                       │
│  ────────                                                       │
│  • Next.js 14 (App Router)                                      │
│  • React 18                                                     │
│  • TypeScript                                                   │
│  • Tailwind CSS                                                 │
│  • Lucide React (icons)                                         │
│                                                                 │
│  BACKEND                                                        │
│  ───────                                                        │
│  • Next.js API Routes                                           │
│  • Rust (Axum framework)                                        │
│  • git2 (libgit2 bindings)                                      │
│                                                                 │
│  DATABASE                                                       │
│  ────────                                                       │
│  • MySQL                                                        │
│  • Prisma ORM                                                   │
│  • SQLx (Rust)                                                  │
│                                                                 │
│  LIBRARIES                                                      │
│  ─────────                                                      │
│  • ExcelJS (Excel generation)                                   │
│  • date-fns (date formatting)                                   │
│  • zod (validation)                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

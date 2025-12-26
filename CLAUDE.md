# Git Work Summarizer - Project Instructions

## Overview
A tool to summarize yearly git work across multiple repositories, generating Excel reports with AI-powered summaries.

## Tech Stack
- **Frontend/API**: Next.js 14 (App Router)
- **Backend Processing**: Rust (git operations, file processing)
- **Database**: MySQL (metadata storage)
- **Storage**: AWS S3 (zip files of commits)
- **AI**: Google Gemini 2.0 Flash for commit summarization

## Architecture

### Next.js App (`/app`)
- Dashboard for managing repos and credentials
- API routes for CRUD operations
- Excel export functionality
- Real-time progress tracking via SSE

### Rust Service (`/rust-service`)
- Git operations (clone, fetch, log parsing)
- Diff extraction and analysis
- Zip file creation
- High-performance batch processing

## Database Schema
```sql
-- repositories: Store git repo configs
-- credentials: Git credentials (encrypted)
-- commits: Parsed commit data
-- summaries: AI-generated summaries
-- exports: Export job tracking
```

## API Endpoints
- `POST /api/repos` - Add repository
- `POST /api/credentials` - Add git credentials
- `POST /api/analyze` - Start analysis job
- `GET /api/commits` - List commits with filters
- `POST /api/export` - Generate Excel export
- `GET /api/export/:id` - Download export

## Environment Variables
```
DATABASE_URL=mysql://user:pass@localhost:3306/git-doc
S3_BUCKET=git-doc
S3_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
GEMINI_API_KEY=
JIRA_API_TOKEN= (optional)
JIRA_BASE_URL= (optional)
```

## Development
```bash
# Start Next.js
pnpm dev

# Build Rust service
cd rust-service && cargo build --release

# Run Rust service
./target/release/git-doc-service
```

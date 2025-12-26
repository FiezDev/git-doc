# Git Work Summarizer

A tool to summarize your yearly git work across multiple repositories, generating Excel reports with AI-powered summaries.

## Features

- 🔐 **Credential Management** - Store Git credentials (PAT, SSH, OAuth) for private repos
- 📁 **Multi-Repo Support** - Analyze commits from multiple repositories
- 🤖 **AI Summaries** - Generate human-readable summaries using OpenAI
- 📊 **Excel Export** - Export to Excel with all commit details
- 📦 **Code Zip Files** - Download changed files for each commit
- 🔗 **JIRA Integration** - Auto-detect and link JIRA tickets

## Tech Stack

- **Frontend/API**: Next.js 14 (App Router)
- **Backend Processing**: Rust (high-performance git operations)
- **Database**: MySQL (via Prisma)
- **Storage**: AWS S3
- **AI**: OpenAI GPT-4o-mini

## Excel Output Columns

| Column | Description |
|--------|-------------|
| Date/Time | Commit timestamp |
| Repository | Source repository name |
| Summary of Change | AI-generated human-readable summary |
| Commit Name | First line of commit message |
| Commit Description | Full commit message |
| Code Change Summary | Files changed with +/- stats |
| Code Zip Link | S3 presigned URL to download changed files |
| JIRA Link | Extracted JIRA ticket URL (if found) |

## Getting Started

### Prerequisites

- Node.js 18+
- Rust (for the backend service)
- MySQL database
- AWS S3 bucket
- OpenAI API key

### Setup

1. **Clone and install dependencies**
   ```bash
   git clone <repo-url>
   cd git-doc
   pnpm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Setup database**
   ```bash
   pnpm db:push
   pnpm db:generate
   ```

4. **Build Rust service**
   ```bash
   cd rust-service
   cargo build --release
   ```

5. **Start services**
   ```bash
   # Terminal 1: Start Next.js
   pnpm dev

   # Terminal 2: Start Rust service
   cd rust-service && cargo run
   ```

6. **Access the app**
   Open http://localhost:3000

## Workflow

1. **Add Credentials** - Add your GitHub/GitLab PAT for private repo access
2. **Add Repositories** - Register repos you want to analyze
3. **Run Analysis** - Parse commits, generate summaries, create zip files
4. **Export to Excel** - Generate and download the Excel report

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/credentials` | GET, POST | Manage git credentials |
| `/api/repos` | GET, POST | Manage repositories |
| `/api/analyze` | POST, GET | Start/check analysis jobs |
| `/api/commits` | GET | List parsed commits |
| `/api/export` | POST, GET | Generate/list Excel exports |

## Rust Service Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/analyze` | POST | Process analysis job |

## Environment Variables

```env
DATABASE_URL=mysql://user:pass@localhost:3306/git_doc
S3_BUCKET=git-doc-exports
S3_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
OPENAI_API_KEY=xxx
RUST_SERVICE_URL=http://localhost:8080
JIRA_BASE_URL=https://your-org.atlassian.net (optional)
```

## License

MIT

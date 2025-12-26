use anyhow::Result;
use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::mysql::MySqlPoolOptions;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod git;
mod models;
mod s3;
mod zip_creator;

use git::GitProcessor;
use s3::S3Client;

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::MySqlPool,
    pub s3: Arc<S3Client>,
    pub work_dir: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let work_dir = std::env::var("GIT_WORK_DIR").unwrap_or_else(|_| "/tmp/git-doc-repos".into());

    // Create work directory
    std::fs::create_dir_all(&work_dir)?;

    // Connect to database
    let pool = MySqlPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await?;

    tracing::info!("Connected to MySQL database");

    // Initialize S3 client
    let s3 = Arc::new(S3Client::new().await);

    let state = AppState {
        db: pool,
        s3,
        work_dir,
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/analyze", post(analyze_repository))
        .route("/webhook/commit", post(process_commit_webhook))
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = std::env::var("BIND_ADDRESS").unwrap_or_else(|_| "0.0.0.0:8080".into());
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("Rust service listening on {}", addr);

    axum::serve(listener, app).await?;

    Ok(())
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "status": "ok" }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeRequest {
    pub job_id: String,
    pub repo_url: String,
    pub branch: String,
    pub credential_token: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub author_filter: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AnalyzeResponse {
    pub job_id: String,
    pub status: String,
    pub message: String,
}

async fn analyze_repository(
    State(state): State<AppState>,
    Json(request): Json<AnalyzeRequest>,
) -> Result<Json<AnalyzeResponse>, (StatusCode, String)> {
    tracing::info!("Starting analysis for job: {}", request.job_id);

    // Update job status to CLONING
    sqlx::query("UPDATE AnalysisJob SET status = 'CLONING' WHERE id = ?")
        .bind(&request.job_id)
        .execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Clone values before spawning
    let job_id = request.job_id.clone();
    let job_id_for_response = request.job_id.clone();
    let state_clone = state.clone();
    let db_for_error = state.db.clone();

    tokio::spawn(async move {
        if let Err(e) = process_analysis(state_clone, request).await {
            tracing::error!("Analysis failed: {}", e);
            let _ = sqlx::query("UPDATE AnalysisJob SET status = 'FAILED', error = ? WHERE id = ?")
                .bind(e.to_string())
                .bind(&job_id)
                .execute(&db_for_error)
                .await;
        }
    });

    Ok(Json(AnalyzeResponse {
        job_id: job_id_for_response,
        status: "PROCESSING".to_string(),
        message: "Analysis started in background".to_string(),
    }))
}

async fn process_analysis(state: AppState, request: AnalyzeRequest) -> Result<()> {
    let processor = GitProcessor::new(&state.work_dir, state.s3.clone());

    // Clone or fetch repository
    let repo_path = processor.clone_or_fetch(
        &request.repo_url,
        &request.branch,
        request.credential_token.as_deref(),
    )?;

    // Update status to PARSING
    sqlx::query("UPDATE AnalysisJob SET status = 'PARSING' WHERE id = ?")
        .bind(&request.job_id)
        .execute(&state.db)
        .await?;

    // Get repository ID from job
    let row: (String,) = sqlx::query_as("SELECT repositoryId FROM AnalysisJob WHERE id = ?")
        .bind(&request.job_id)
        .fetch_one(&state.db)
        .await?;
    let repository_id = row.0;

    // Parse commits
    let commits = processor.parse_commits(
        &repo_path,
        request.start_date.as_deref(),
        request.end_date.as_deref(),
        request.author_filter.as_deref(),
    )?;

    let total_commits = commits.len();

    // Update total commits count
    sqlx::query("UPDATE AnalysisJob SET totalCommits = ? WHERE id = ?")
        .bind(total_commits as i32)
        .execute(&state.db)
        .await?;

    // Process each commit
    for (idx, commit) in commits.iter().enumerate() {
        // Check if commit already exists
        let existing: Option<(String,)> = sqlx::query_as(
            "SELECT id FROM Commit WHERE repositoryId = ? AND sha = ?",
        )
        .bind(&repository_id)
        .bind(&commit.sha)
        .fetch_optional(&state.db)
        .await?;

        if existing.is_some() {
            tracing::debug!("Commit {} already exists, skipping", commit.sha);
            continue;
        }

        // Create zip file of changed files
        let zip_key = processor
            .create_commit_zip(&repo_path, &repository_id, commit)
            .await?;

        // Extract JIRA ticket from commit message
        let jira_key = extract_jira_key(&commit.message);
        let jira_url = jira_key
            .as_ref()
            .map(|key| {
                std::env::var("JIRA_BASE_URL")
                    .map(|base| format!("{}/browse/{}", base, key))
                    .ok()
            })
            .flatten();

        // Insert commit
        sqlx::query(
            r#"
            INSERT INTO Commit (
                id, repositoryId, sha, authorName, authorEmail, commitDate,
                message, messageTitle, filesChanged, insertions, deletions,
                diffSummary, zipFileKey, zipFileSize, jiraKey, jiraUrl,
                summaryStatus, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NOW(), NOW())
            "#,
        )
        .bind(&commit.id)
        .bind(&repository_id)
        .bind(&commit.sha)
        .bind(&commit.author_name)
        .bind(&commit.author_email)
        .bind(&commit.commit_date)
        .bind(&commit.message)
        .bind(&commit.message_title)
        .bind(commit.files_changed as i32)
        .bind(commit.insertions as i32)
        .bind(commit.deletions as i32)
        .bind(&commit.diff_summary)
        .bind(&zip_key)
        .bind(commit.zip_size.map(|s| s as i32))
        .bind(&jira_key)
        .bind(&jira_url)
        .execute(&state.db)
        .await?;

        // Insert changed files
        for file in &commit.changed_files {
            sqlx::query(
                r#"
                INSERT INTO ChangedFile (id, commitId, filePath, changeType, additions, deletions, patch)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                "#,
            )
            .bind(uuid::Uuid::new_v4().to_string())
            .bind(&commit.id)
            .bind(&file.path)
            .bind(&file.change_type)
            .bind(file.additions as i32)
            .bind(file.deletions as i32)
            .bind(&file.patch)
            .execute(&state.db)
            .await?;
        }

        // Update progress
        sqlx::query("UPDATE AnalysisJob SET processedCommits = ? WHERE id = ?")
            .bind((idx + 1) as i32)
            .bind(&request.job_id)
            .execute(&state.db)
            .await?;
    }

    // Update job to completed
    sqlx::query("UPDATE AnalysisJob SET status = 'COMPLETED', completedAt = NOW() WHERE id = ?")
        .bind(&request.job_id)
        .execute(&state.db)
        .await?;

    // Update repository last sync time
    sqlx::query("UPDATE Repository SET lastSyncAt = NOW() WHERE id = ?")
        .bind(&repository_id)
        .execute(&state.db)
        .await?;

    tracing::info!(
        "Analysis completed for job {}: {} commits processed",
        request.job_id,
        total_commits
    );

    Ok(())
}

fn extract_jira_key(message: &str) -> Option<String> {
    let re = regex::Regex::new(r"([A-Z][A-Z0-9]+-\d+)").ok()?;
    re.find(message).map(|m| m.as_str().to_string())
}

#[derive(Debug, Deserialize)]
pub struct CommitWebhook {
    pub repository_id: String,
    pub commit_sha: String,
}

async fn process_commit_webhook(
    State(_state): State<AppState>,
    Json(_webhook): Json<CommitWebhook>,
) -> impl IntoResponse {
    // Handle real-time commit processing via webhooks
    Json(serde_json::json!({ "status": "received" }))
}

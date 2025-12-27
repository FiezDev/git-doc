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
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod git;
mod models;

use git::GitProcessor;

// Helper to sanitize strings for MySQL (remove null bytes, control chars, and ensure valid UTF-8)
fn sanitize_for_mysql(s: &str, max_len: usize) -> String {
    let cleaned: String = s.chars()
        .filter(|c| {
            // Keep printable ASCII, newlines, tabs, and common unicode
            // Remove null bytes and other problematic control characters
            let code = *c as u32;
            *c == '\n' || *c == '\r' || *c == '\t' || 
            (code >= 0x20 && code < 0x7F) || // Printable ASCII
            (code >= 0x80 && code < 0xFFFF) // Common unicode (excluding surrogates)
        })
        .take(max_len)
        .collect();
    cleaned
}

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::MySqlPool,
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

    // Connect to database with proper settings
    // Use smaller pool to avoid connection issues
    let pool = MySqlPoolOptions::new()
        .max_connections(2)
        .min_connections(1)
        .acquire_timeout(std::time::Duration::from_secs(60))
        .idle_timeout(std::time::Duration::from_secs(120))
        .max_lifetime(std::time::Duration::from_secs(300))
        .test_before_acquire(true) // Always test connection before using
        .connect(&database_url)
        .await?;

    tracing::info!("Connected to MySQL database");

    let state = AppState {
        db: pool,
        work_dir,
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/analyze", post(analyze_repository))
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
    tracing::info!("Repo URL: {}, Branch: {}", request.repo_url, request.branch);
    tracing::info!("Token present: {}", request.credential_token.is_some());

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
    let processor = GitProcessor::new(&state.work_dir);

    // Clone or fetch repository
    tracing::info!("Cloning/fetching repository...");
    let repo_path = processor.clone_or_fetch(
        &request.repo_url,
        &request.branch,
        request.credential_token.as_deref(),
    )?;
    tracing::info!("Repository ready at {:?}", repo_path);

    // Update status to PARSING
    tracing::info!("Updating status to PARSING...");
    sqlx::query("UPDATE AnalysisJob SET status = 'PARSING' WHERE id = ?")
        .bind(&request.job_id)
        .execute(&state.db)
        .await?;
    tracing::info!("Status updated to PARSING");

    // Get repository ID from job
    tracing::info!("Getting repository ID...");
    let row: (String,) = sqlx::query_as("SELECT repositoryId FROM AnalysisJob WHERE id = ?")
        .bind(&request.job_id)
        .fetch_one(&state.db)
        .await?;
    let repository_id = row.0;
    tracing::info!("Repository ID: {}", repository_id);

    // Parse commits
    tracing::info!("Parsing commits...");
    let commits = processor.parse_commits(
        &repo_path,
        request.start_date.as_deref(),
        request.end_date.as_deref(),
        request.author_filter.as_deref(),
    )?;

    let total_commits = commits.len();
    tracing::info!("Found {} commits to process", total_commits);

    // Update total commits count
    tracing::info!("Updating total commits count...");
    match sqlx::query("UPDATE AnalysisJob SET totalCommits = ? WHERE id = ?")
        .bind(total_commits as i32)
        .bind(&request.job_id)
        .execute(&state.db)
        .await
    {
        Ok(result) => tracing::info!("Total commits count updated, rows affected: {}", result.rows_affected()),
        Err(e) => {
            tracing::error!("Failed to update total commits: {:?}", e);
            return Err(e.into());
        }
    }

    // Sleep briefly to let connection settle
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    // Test a simple query first
    tracing::debug!("Testing connection with simple query...");
    match sqlx::query_as::<_, (i64,)>("SELECT 1")
        .fetch_one(&state.db)
        .await
    {
        Ok(_) => tracing::debug!("Connection test passed"),
        Err(e) => {
            tracing::error!("Connection test failed: {:?}", e);
            return Err(e.into());
        }
    }

    // Process each commit
    for (idx, commit) in commits.iter().enumerate() {
        tracing::debug!("Checking if commit {} exists...", &commit.sha[..8]);
        // Check if commit already exists
        let existing: Option<(String,)> = sqlx::query_as(
            "SELECT id FROM Commit WHERE repositoryId = ? AND sha = ?",
        )
        .bind(&repository_id)
        .bind(&commit.sha)
        .fetch_optional(&state.db)
        .await?;
        tracing::debug!("Commit exists check completed for {}", &commit.sha[..8]);

        if existing.is_some() {
            tracing::debug!("Commit {} already exists, skipping", commit.sha);
            continue;
        }

        tracing::info!("Processing commit {} ({}/{})", &commit.sha[..8], idx + 1, total_commits);

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

        // Log data sizes for debugging
        let msg_len = commit.message.len();
        let title_len = commit.message_title.len();
        let paths_len = commit.changed_paths.len();
        tracing::debug!("Commit data sizes - message: {}, title: {}, paths: {}", msg_len, title_len, paths_len);

        // Insert commit (simplified - no diff details, just file paths)
        tracing::debug!("Inserting commit...");
        sqlx::query(
            r#"
            INSERT INTO Commit (
                id, repositoryId, sha, authorName, authorEmail, commitDate,
                message, messageTitle, filesChanged, changedPaths,
                jiraKey, jiraUrl, summaryStatus, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NOW(), NOW())
            "#,
        )
        .bind(&commit.id)
        .bind(&repository_id)
        .bind(&commit.sha)
        .bind(sanitize_for_mysql(&commit.author_name, 500))
        .bind(sanitize_for_mysql(&commit.author_email, 500))
        .bind(&commit.commit_date)
        .bind(sanitize_for_mysql(&commit.message, 65000))
        .bind(sanitize_for_mysql(&commit.message_title, 500))
        .bind(commit.files_changed as i32)
        .bind(sanitize_for_mysql(&commit.changed_paths, 65000))
        .bind(&jira_key)
        .bind(&jira_url)
        .execute(&state.db)
        .await?;

        tracing::debug!("Inserted commit record");

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

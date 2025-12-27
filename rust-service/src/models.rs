use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedCommit {
    pub id: String,
    pub sha: String,
    pub author_name: String,
    pub author_email: String,
    pub commit_date: DateTime<Utc>,
    pub message: String,
    pub message_title: String,
    pub files_changed: usize,
    pub changed_paths: String, // Comma-separated list of file paths
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepositoryInfo {
    pub name: String,
    pub url: String,
    pub branch: String,
    pub last_commit_sha: Option<String>,
}

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
    pub insertions: usize,
    pub deletions: usize,
    pub diff_summary: String,
    pub changed_files: Vec<ChangedFile>,
    pub zip_size: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangedFile {
    pub path: String,
    pub change_type: String, // ADDED, MODIFIED, DELETED, RENAMED
    pub additions: usize,
    pub deletions: usize,
    pub patch: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepositoryInfo {
    pub name: String,
    pub url: String,
    pub branch: String,
    pub last_commit_sha: Option<String>,
}

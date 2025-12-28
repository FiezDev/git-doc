use anyhow::{Context, Result};
use chrono::{TimeZone, Utc};
use git2::{Cred, DiffOptions, FetchOptions, RemoteCallbacks, Repository};
use std::path::{Path, PathBuf};

use crate::models::ParsedCommit;

pub struct GitProcessor {
    work_dir: PathBuf,
}

impl GitProcessor {
    pub fn new(work_dir: &str) -> Self {
        Self {
            work_dir: PathBuf::from(work_dir),
        }
    }

    /// Clone a repository or fetch updates if already cloned
    pub fn clone_or_fetch(
        &self,
        url: &str,
        branch: &str,
        token: Option<&str>,
        all_branches: bool,
    ) -> Result<PathBuf> {
        // Generate a unique directory name from URL
        let repo_hash = format!("{:x}", md5::compute(url));
        let repo_path = self.work_dir.join(&repo_hash);

        if repo_path.exists() {
            tracing::info!("Repository exists, fetching updates: {}", url);
            self.fetch_updates(&repo_path, branch, token, all_branches)?;
        } else {
            tracing::info!("Cloning repository: {}", url);
            self.clone_repo(url, &repo_path, branch, token)?;
        }

        Ok(repo_path)
    }

    fn clone_repo(
        &self,
        url: &str,
        path: &Path,
        branch: &str,
        token: Option<&str>,
    ) -> Result<()> {
        let mut callbacks = RemoteCallbacks::new();

        if let Some(token) = token {
            tracing::info!("Using token for authentication (length: {})", token.len());
            let token = token.to_string();
            callbacks.credentials(move |_url, _username_from_url, _allowed_types| {
                // For GitHub PATs, use "x-access-token" as username and token as password
                // This works for both classic PATs and fine-grained tokens
                Cred::userpass_plaintext("x-access-token", &token)
            });
        } else {
            tracing::warn!("No token provided, cloning without authentication");
        }

        let mut fetch_options = FetchOptions::new();
        fetch_options.remote_callbacks(callbacks);

        let mut builder = git2::build::RepoBuilder::new();
        builder.fetch_options(fetch_options);
        builder.branch(branch);

        let clone_result = builder.clone(url, path);
        
        match &clone_result {
            Ok(_) => tracing::info!("Successfully cloned repository"),
            Err(e) => tracing::error!("Git clone error: {} (class: {:?}, code: {:?})", e.message(), e.class(), e.code()),
        }
        
        clone_result.context(format!("Failed to clone repository: {}", url))?;

        Ok(())
    }

    fn fetch_updates(&self, path: &Path, branch: &str, token: Option<&str>, all_branches: bool) -> Result<()> {
        let repo = Repository::open(path).context("Failed to open repository")?;

        let mut callbacks = RemoteCallbacks::new();
        if let Some(token) = token {
            let token = token.to_string();
            callbacks.credentials(move |_url, _username_from_url, _allowed_types| {
                Cred::userpass_plaintext("x-access-token", &token)
            });
        }

        let mut fetch_options = FetchOptions::new();
        fetch_options.remote_callbacks(callbacks);

        let mut remote = repo.find_remote("origin").context("Failed to find remote")?;
        
        if all_branches {
            // Fetch all branches
            tracing::info!("Fetching all branches from remote");
            remote
                .fetch(&["refs/heads/*:refs/remotes/origin/*"], Some(&mut fetch_options), None)
                .context("Failed to fetch all branches")?;
        } else {
            remote
                .fetch(&[branch], Some(&mut fetch_options), None)
                .context("Failed to fetch updates")?;

            // Fast-forward to latest
            let fetch_head = repo.find_reference("FETCH_HEAD")?;
            let fetch_commit = repo.reference_to_annotated_commit(&fetch_head)?;

            let refname = format!("refs/heads/{}", branch);
            if let Ok(mut reference) = repo.find_reference(&refname) {
                reference.set_target(fetch_commit.id(), "Fast-forward")?;
            }

            repo.checkout_head(Some(
                git2::build::CheckoutBuilder::default().force(),
            ))?;
        }

        Ok(())
    }

    /// Parse commits from repository for a specific branch or all branches
    pub fn parse_commits(
        &self,
        repo_path: &Path,
        branch: &str,
        start_date: Option<&str>,
        end_date: Option<&str>,
        author_filter: Option<&str>,
        all_branches: bool,
    ) -> Result<Vec<ParsedCommit>> {
        let repo = Repository::open(repo_path).context("Failed to open repository")?;
        
        // Find the branch reference
        let mut revwalk = repo.revwalk()?;
        
        if all_branches {
            // Walk all branches (local and remote)
            revwalk.push_glob("refs/heads/*")?;
            revwalk.push_glob("refs/remotes/origin/*")?;
            tracing::info!("Walking commits from all branches");
        } else {
            // Try to find the branch in remote refs first (origin/branch), then local
            let branch_ref = format!("refs/remotes/origin/{}", branch);
            let local_ref = format!("refs/heads/{}", branch);
            
            if let Ok(reference) = repo.find_reference(&branch_ref) {
                let oid = reference.target().context("Failed to get branch target")?;
                revwalk.push(oid)?;
                tracing::info!("Walking commits from remote branch: {}", branch_ref);
            } else if let Ok(reference) = repo.find_reference(&local_ref) {
                let oid = reference.target().context("Failed to get branch target")?;
                revwalk.push(oid)?;
                tracing::info!("Walking commits from local branch: {}", local_ref);
            } else {
                // Fallback to HEAD
                tracing::warn!("Branch '{}' not found, falling back to HEAD", branch);
                revwalk.push_head()?;
            }
        }
        
        revwalk.set_sorting(git2::Sort::TIME)?;

        let start_ts = start_date
            .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
            .map(|d| d.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp());

        let end_ts = end_date
            .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
            .map(|d| d.and_hms_opt(23, 59, 59).unwrap().and_utc().timestamp());

        let mut commits = Vec::new();

        for oid in revwalk.flatten() {
            let commit = repo.find_commit(oid)?;
            let time = commit.time().seconds();

            // Filter by date range
            if let Some(start) = start_ts {
                if time < start {
                    continue;
                }
            }
            if let Some(end) = end_ts {
                if time > end {
                    break; // Commits are sorted by time, so we can break early
                }
            }

            // Filter by author (supports comma-separated list)
            let author = commit.author();
            let author_email = author.email().unwrap_or("");
            let author_name = author.name().unwrap_or("");

            if let Some(filter) = author_filter {
                // Split by comma for multiple authors
                let filters: Vec<&str> = filter.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
                if !filters.is_empty() {
                    let matches = filters.iter().any(|f| {
                        author_email == *f || author_email.contains(f) || author_name.contains(f)
                    });
                    if !matches {
                        continue;
                    }
                }
            }

            let message = commit.message().unwrap_or("").to_string();
            let message_title = message.lines().next().unwrap_or("").to_string();

            // Get changed file paths (simple list, no diffs)
            let (files_changed, changed_paths) = self.get_changed_paths(&repo, &commit)?;

            commits.push(ParsedCommit {
                id: uuid::Uuid::new_v4().to_string(),
                sha: oid.to_string(),
                author_name: author_name.to_string(),
                author_email: author_email.to_string(),
                commit_date: Utc.timestamp_opt(time, 0).unwrap(),
                message,
                message_title,
                files_changed,
                changed_paths,
            });
        }

        Ok(commits)
    }

    /// Get list of changed file paths for a commit
    fn get_changed_paths(
        &self,
        repo: &Repository,
        commit: &git2::Commit,
    ) -> Result<(usize, String)> {
        let tree = commit.tree()?;
        let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());

        let mut opts = DiffOptions::new();
        opts.include_untracked(false);

        let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))?;

        let stats = diff.stats()?;
        let files_changed = stats.files_changed();

        // Collect file paths
        let mut paths: Vec<String> = Vec::new();

        diff.foreach(
            &mut |delta, _progress| {
                let path = delta
                    .new_file()
                    .path()
                    .or_else(|| delta.old_file().path())
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|| "unknown".to_string());

                paths.push(path);
                true
            },
            None,
            None,
            None,
        )?;

        // Join paths with newline for storage
        let changed_paths = paths.join("\n");

        Ok((files_changed, changed_paths))
    }
}

// Simple MD5 hash for generating directory names
mod md5 {
    pub fn compute(input: &str) -> u128 {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        input.hash(&mut hasher);
        hasher.finish() as u128
    }
}

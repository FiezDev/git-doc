use anyhow::{Context, Result};
use chrono::{TimeZone, Utc};
use git2::{Cred, DiffOptions, FetchOptions, RemoteCallbacks, Repository};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::models::{ChangedFile, ParsedCommit};
use crate::s3::S3Client;
use crate::zip_creator;

pub struct GitProcessor {
    work_dir: PathBuf,
    s3: Arc<S3Client>,
}

impl GitProcessor {
    pub fn new(work_dir: &str, s3: Arc<S3Client>) -> Self {
        Self {
            work_dir: PathBuf::from(work_dir),
            s3,
        }
    }

    /// Clone a repository or fetch updates if already cloned
    pub fn clone_or_fetch(
        &self,
        url: &str,
        branch: &str,
        token: Option<&str>,
    ) -> Result<PathBuf> {
        // Generate a unique directory name from URL
        let repo_hash = format!("{:x}", md5::compute(url));
        let repo_path = self.work_dir.join(&repo_hash);

        if repo_path.exists() {
            tracing::info!("Repository exists, fetching updates: {}", url);
            self.fetch_updates(&repo_path, branch, token)?;
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
            let token = token.to_string();
            callbacks.credentials(move |_url, username_from_url, _allowed_types| {
                Cred::userpass_plaintext(
                    username_from_url.unwrap_or("git"),
                    &token,
                )
            });
        }

        let mut fetch_options = FetchOptions::new();
        fetch_options.remote_callbacks(callbacks);

        let mut builder = git2::build::RepoBuilder::new();
        builder.fetch_options(fetch_options);
        builder.branch(branch);

        builder
            .clone(url, path)
            .context("Failed to clone repository")?;

        Ok(())
    }

    fn fetch_updates(&self, path: &Path, branch: &str, token: Option<&str>) -> Result<()> {
        let repo = Repository::open(path).context("Failed to open repository")?;

        let mut callbacks = RemoteCallbacks::new();
        if let Some(token) = token {
            let token = token.to_string();
            callbacks.credentials(move |_url, username_from_url, _allowed_types| {
                Cred::userpass_plaintext(
                    username_from_url.unwrap_or("git"),
                    &token,
                )
            });
        }

        let mut fetch_options = FetchOptions::new();
        fetch_options.remote_callbacks(callbacks);

        let mut remote = repo.find_remote("origin").context("Failed to find remote")?;
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

        Ok(())
    }

    /// Parse commits from repository
    pub fn parse_commits(
        &self,
        repo_path: &Path,
        start_date: Option<&str>,
        end_date: Option<&str>,
        author_filter: Option<&str>,
    ) -> Result<Vec<ParsedCommit>> {
        let repo = Repository::open(repo_path).context("Failed to open repository")?;
        let mut revwalk = repo.revwalk()?;
        revwalk.push_head()?;
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

            // Filter by author
            let author = commit.author();
            let author_email = author.email().unwrap_or("");
            let author_name = author.name().unwrap_or("");

            if let Some(filter) = author_filter {
                if !author_email.contains(filter) && !author_name.contains(filter) {
                    continue;
                }
            }

            let message = commit.message().unwrap_or("").to_string();
            let message_title = message.lines().next().unwrap_or("").to_string();

            // Get diff stats
            let (changed_files, insertions, deletions, diff_summary, files) =
                self.get_commit_diff(&repo, &commit)?;

            commits.push(ParsedCommit {
                id: uuid::Uuid::new_v4().to_string(),
                sha: oid.to_string(),
                author_name: author_name.to_string(),
                author_email: author_email.to_string(),
                commit_date: Utc.timestamp_opt(time, 0).unwrap(),
                message,
                message_title,
                files_changed: changed_files,
                insertions,
                deletions,
                diff_summary,
                changed_files: files,
                zip_size: None,
            });
        }

        Ok(commits)
    }

    fn get_commit_diff(
        &self,
        repo: &Repository,
        commit: &git2::Commit,
    ) -> Result<(usize, usize, usize, String, Vec<ChangedFile>)> {
        let tree = commit.tree()?;
        let parent_tree = commit.parent(0).ok().and_then(|p| p.tree().ok());

        let mut opts = DiffOptions::new();
        opts.include_untracked(false);

        let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))?;

        let stats = diff.stats()?;
        let files_changed = stats.files_changed();
        let insertions = stats.insertions();
        let deletions = stats.deletions();

        // Build diff summary
        let mut summary = String::new();
        let mut files = Vec::new();

        diff.foreach(
            &mut |delta, _progress| {
                let path = delta
                    .new_file()
                    .path()
                    .or_else(|| delta.old_file().path())
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|| "unknown".to_string());

                let change_type = match delta.status() {
                    git2::Delta::Added => "ADDED",
                    git2::Delta::Deleted => "DELETED",
                    git2::Delta::Modified => "MODIFIED",
                    git2::Delta::Renamed => "RENAMED",
                    git2::Delta::Copied => "COPIED",
                    _ => "MODIFIED",
                };

                summary.push_str(&format!("{}: {}\n", change_type, path));

                files.push(ChangedFile {
                    path,
                    change_type: change_type.to_string(),
                    additions: 0,
                    deletions: 0,
                    patch: None,
                });

                true
            },
            None,
            None,
            None,
        )?;

        // Get line counts per file
        diff.foreach(
            &mut |_delta, _progress| true,
            None,
            None,
            Some(&mut |delta, _hunk, line| {
                if let Some(file) = files.iter_mut().find(|f| {
                    delta
                        .new_file()
                        .path()
                        .map(|p| p.to_string_lossy() == f.path)
                        .unwrap_or(false)
                }) {
                    match line.origin() {
                        '+' => file.additions += 1,
                        '-' => file.deletions += 1,
                        _ => {}
                    }
                }
                true
            }),
        )?;

        Ok((files_changed, insertions, deletions, summary, files))
    }

    /// Create a zip file containing all changed files in a commit
    pub async fn create_commit_zip(
        &self,
        repo_path: &Path,
        repo_id: &str,
        commit: &ParsedCommit,
    ) -> Result<Option<String>> {
        if commit.changed_files.is_empty() {
            return Ok(None);
        }

        // Collect file contents synchronously (git2 types aren't Send)
        let file_contents = {
            let repo = Repository::open(repo_path)?;
            let oid = git2::Oid::from_str(&commit.sha)?;
            let commit_obj = repo.find_commit(oid)?;
            let tree = commit_obj.tree()?;

            let mut contents = Vec::new();
            for file in &commit.changed_files {
                if file.change_type == "DELETED" {
                    continue;
                }

                if let Ok(entry) = tree.get_path(Path::new(&file.path)) {
                    if let Ok(blob) = repo.find_blob(entry.id()) {
                        contents.push((file.path.clone(), blob.content().to_vec()));
                    }
                }
            }
            contents
        }; // git2 types are dropped here before async

        if file_contents.is_empty() {
            return Ok(None);
        }

        // Create zip file
        let zip_buffer = zip_creator::create_zip(&file_contents)?;
        let zip_size = zip_buffer.len();

        // Upload to S3
        let key = format!("commits/{}/{}.zip", repo_id, commit.sha);
        self.s3.upload(&key, zip_buffer, "application/zip").await?;

        tracing::debug!("Uploaded commit zip: {} ({} bytes)", key, zip_size);

        Ok(Some(key))
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

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Repository {
  id: string
  name: string
  url: string
  branch: string
  lastSyncAt: string | null
  _count: { commits: number }
}

interface Commit {
  id: string
  sha: string
  messageTitle: string
  message: string
  authorName: string
  authorEmail: string
  commitDate: string
  filesChanged: number
  summary: string | null
  summaryStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  jiraKey: string | null
  jiraUrl: string | null
  repository: { id: string; name: string }
}

interface CommitsResponse {
  commits: Commit[]
  total: number
  page: number
  limit: number
  totalPages: number
}

interface Author {
  email: string
  name: string
  commitCount: number
}

export default function PreviewPage() {
  const [repos, setRepos] = useState<Repository[]>([])
  const [selectedRepoId, setSelectedRepoId] = useState<string>('')
  const [commits, setCommits] = useState<Commit[]>([])
  const [loading, setLoading] = useState(true)
  const [commitsLoading, setCommitsLoading] = useState(false)
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 })
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null)
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([])
  const [authors, setAuthors] = useState<Author[]>([])

  // Load repositories
  useEffect(() => {
    fetch('/api/repos')
      .then((res) => res.json())
      .then((data) => {
        setRepos(data)
        setLoading(false)
      })
  }, [])

  // Load authors when repository changes
  useEffect(() => {
    if (!selectedRepoId) {
      setAuthors([])
      setSelectedAuthors([])
      return
    }

    // Fetch authors from the new API
    fetch(`/api/authors?repoId=${selectedRepoId}`)
      .then((res) => res.json())
      .then((data: Author[]) => {
        setAuthors(data)
      })
  }, [selectedRepoId])

  // Load commits when repository or author filter changes
  useEffect(() => {
    if (!selectedRepoId) {
      setCommits([])
      setPagination({ page: 1, totalPages: 1, total: 0 })
      return
    }

    setCommitsLoading(true)
    const params = new URLSearchParams({
      repoId: selectedRepoId,
      limit: '20',
    })
    if (selectedAuthors.length > 0) {
      params.set('authorEmails', selectedAuthors.join(','))
    }
    fetch(`/api/commits?${params.toString()}`)
      .then((res) => res.json())
      .then((data: CommitsResponse) => {
        setCommits(data.commits)
        setPagination({
          page: data.page,
          totalPages: data.totalPages,
          total: data.total,
        })
        setCommitsLoading(false)
      })
  }, [selectedRepoId, selectedAuthors])

  const loadPage = async (page: number) => {
    if (!selectedRepoId) return

    setCommitsLoading(true)
    const params = new URLSearchParams({
      repoId: selectedRepoId,
      page: page.toString(),
      limit: '20',
    })
    if (selectedAuthors.length > 0) {
      params.set('authorEmails', selectedAuthors.join(','))
    }
    const res = await fetch(`/api/commits?${params.toString()}`)
    const data: CommitsResponse = await res.json()
    setCommits(data.commits)
    setPagination({
      page: data.page,
      totalPages: data.totalPages,
      total: data.total,
    })
    setCommitsLoading(false)
  }

  const selectedRepo = repos.find((r) => r.id === selectedRepoId)

  const getSummaryStatusBadge = (status: Commit['summaryStatus']) => {
    const styles = {
      PENDING: 'bg-gray-100 text-gray-700',
      PROCESSING: 'bg-yellow-100 text-yellow-700',
      COMPLETED: 'bg-green-100 text-green-700',
      FAILED: 'bg-red-100 text-red-700',
    }
    const labels = {
      PENDING: '⏳ Pending',
      PROCESSING: '🔄 Processing',
      COMPLETED: '✅ Summarized',
      FAILED: '❌ Failed',
    }
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status]}`}>
        {labels[status]}
      </span>
    )
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const stats = {
    total: pagination.total,
    summarized: commits.filter((c) => c.summaryStatus === 'COMPLETED').length,
    pending: commits.filter((c) => c.summaryStatus === 'PENDING').length,
    withJira: commits.filter((c) => c.jiraKey).length,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-gray-500">Loading repositories...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Commit Preview</h1>
        <p className="mt-2 text-gray-600">
          Select a repository to preview analyzed commits and summaries
        </p>
      </div>

      {/* Repository Selector */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Select Repository</h2>
        
        {repos.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No repositories found.</p>
            <Link
              href="/repos/new"
              className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              ➕ Add Repository
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {repos.map((repo) => (
              <button
                key={repo.id}
                onClick={() => setSelectedRepoId(repo.id)}
                className={`p-4 border-2 rounded-lg text-left transition-all ${
                  selectedRepoId === repo.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate">{repo.name}</h3>
                    <p className="text-sm text-gray-500 truncate">{repo.url}</p>
                    <p className="text-xs text-gray-400 mt-1">Branch: {repo.branch}</p>
                  </div>
                  {selectedRepoId === repo.id && (
                    <span className="ml-2 text-blue-500">✓</span>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    📝 {repo._count.commits} commits
                  </span>
                  {repo.lastSyncAt && (
                    <span className="text-gray-400 text-xs">
                      Synced: {new Date(repo.lastSyncAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stats Overview */}
      {selectedRepo && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Analysis Overview: {selectedRepo.name}
          </h2>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-sm text-gray-500">Total Commits</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.summarized}</div>
              <div className="text-sm text-gray-500">Summarized</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
              <div className="text-sm text-gray-500">Pending</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.withJira}</div>
              <div className="text-sm text-gray-500">With JIRA</div>
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <Link
              href={`/analyze?repoId=${selectedRepoId}`}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              🔄 Analyze More
            </Link>
            <Link
              href="/exports/new"
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              📊 Export to Excel
            </Link>
          </div>
        </div>
      )}

      {/* Commits List */}
      {selectedRepoId && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h2 className="text-lg font-medium text-gray-900">Analyzed Commits</h2>
                  <p className="text-sm text-gray-500">
                    Showing {commits.length} of {pagination.total} commits
                    {selectedAuthors.length > 0 && (
                      <span className="text-blue-600"> by {selectedAuthors.length} selected author(s)</span>
                    )}
                  </p>
                </div>
                {selectedAuthors.length > 0 && (
                  <button
                    onClick={() => setSelectedAuthors([])}
                    className="text-sm text-gray-500 hover:text-gray-700 underline"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
              
              {/* Author Filter - Multi-select checkboxes */}
              {authors.length > 0 && (
                <div className="border rounded-lg p-3 bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">
                      👤 Filter by Authors:
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedAuthors(authors.map(a => a.email))}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Select all
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        onClick={() => setSelectedAuthors([])}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                    {authors.map((author) => (
                      <label
                        key={author.email}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm cursor-pointer transition-colors ${
                          selectedAuthors.includes(author.email)
                            ? 'bg-blue-100 text-blue-800 border-2 border-blue-300'
                            : 'bg-white text-gray-700 border border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedAuthors.includes(author.email)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedAuthors([...selectedAuthors, author.email])
                            } else {
                              setSelectedAuthors(selectedAuthors.filter(email => email !== author.email))
                            }
                          }}
                          className="sr-only"
                        />
                        <span className="truncate max-w-[150px]">{author.name}</span>
                        <span className="text-xs opacity-70">({author.commitCount})</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {commitsLoading ? (
            <div className="p-8 text-center">
              <div className="animate-pulse text-gray-500">Loading commits...</div>
            </div>
          ) : commits.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500">No commits analyzed yet for this repository.</p>
              <Link
                href={`/analyze?repoId=${selectedRepoId}`}
                className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                🔄 Start Analysis
              </Link>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-gray-200">
                {commits.map((commit) => (
                  <li key={commit.id} className="hover:bg-gray-50">
                    <div
                      className="px-6 py-4 cursor-pointer"
                      onClick={() =>
                        setExpandedCommit(expandedCommit === commit.id ? null : commit.id)
                      }
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                              {commit.sha.substring(0, 7)}
                            </span>
                            {getSummaryStatusBadge(commit.summaryStatus)}
                            {commit.jiraKey && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">
                                🎫 {commit.jiraKey}
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-medium text-gray-900 truncate">
                            {commit.messageTitle}
                          </h3>
                          <div className="mt-1 flex items-center gap-4 text-xs text-gray-500">
                            <span>👤 {commit.authorName}</span>
                            <span>📅 {formatDate(commit.commitDate)}</span>
                            <span>📁 {commit.filesChanged} files</span>
                          </div>
                        </div>
                        <span className="ml-4 text-gray-400">
                          {expandedCommit === commit.id ? '▼' : '▶'}
                        </span>
                      </div>

                      {/* Expanded Content */}
                      {expandedCommit === commit.id && (
                        <div className="mt-4 space-y-4 border-t pt-4">
                          {/* Full Commit Message */}
                          <div>
                            <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">
                              Commit Message
                            </h4>
                            <pre className="text-sm text-gray-700 bg-gray-50 p-3 rounded whitespace-pre-wrap font-sans">
                              {commit.message}
                            </pre>
                          </div>

                          {/* AI Summary */}
                          <div>
                            <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">
                              AI Summary
                            </h4>
                            {commit.summary ? (
                              <div className="text-sm text-gray-700 bg-green-50 p-3 rounded border border-green-200">
                                {commit.summary}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-400 italic bg-gray-50 p-3 rounded">
                                {commit.summaryStatus === 'PENDING'
                                  ? 'Summary not yet generated. Run analysis to generate.'
                                  : commit.summaryStatus === 'PROCESSING'
                                  ? 'Summary is being generated...'
                                  : 'Failed to generate summary.'}
                              </div>
                            )}
                          </div>

                          {/* JIRA Link */}
                          {commit.jiraKey && (
                            <div>
                              <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">
                                JIRA Ticket
                              </h4>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-purple-700">
                                  {commit.jiraKey}
                                </span>
                                {commit.jiraUrl && (
                                  <a
                                    href={commit.jiraUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-blue-600 hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    Open in JIRA →
                                  </a>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    Page {pagination.page} of {pagination.totalPages}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => loadPage(pagination.page - 1)}
                      disabled={pagination.page === 1}
                      className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      ← Previous
                    </button>
                    <button
                      onClick={() => loadPage(pagination.page + 1)}
                      disabled={pagination.page === pagination.totalPages}
                      className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

interface Repository {
  id: string
  name: string
  url: string
}

interface AnalysisJob {
  id: string
  status: string
  totalCommits: number
  processedCommits: number
  error: string | null
}

interface SummarizeResult {
  status: 'idle' | 'processing' | 'completed' | 'failed'
  success: number
  failed: number
  total: number
}

interface Author {
  email: string
  name: string
  commitCount: number
}

export default function AnalyzePage() {
  const searchParams = useSearchParams()
  const preselectedRepoId = searchParams.get('repoId')

  const [repos, setRepos] = useState<Repository[]>([])
  const [selectedRepo, setSelectedRepo] = useState(preselectedRepoId || '')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([])
  const [authors, setAuthors] = useState<Author[]>([])
  const [loading, setLoading] = useState(false)
  const [job, setJob] = useState<AnalysisJob | null>(null)
  const [summarize, setSummarize] = useState<SummarizeResult>({
    status: 'idle',
    success: 0,
    failed: 0,
    total: 0,
  })

  useEffect(() => {
    fetch('/api/repos')
      .then((res) => res.json())
      .then((data) => {
        setRepos(data)
        if (data.length > 0) {
          setSelectedRepo((prev) => prev || data[0].id)
        }
      })
  }, [])

  // Load authors when repository changes
  useEffect(() => {
    if (!selectedRepo) {
      setAuthors([])
      return
    }

    fetch(`/api/authors?repoId=${selectedRepo}`)
      .then((res) => res.json())
      .then((data: Author[]) => {
        setAuthors(data)
      })
  }, [selectedRepo])

  // Set default date range to current year
  useEffect(() => {
    const now = new Date()
    const yearStart = new Date(now.getFullYear(), 0, 1)
    setStartDate(yearStart.toISOString().split('T')[0])
    setEndDate(now.toISOString().split('T')[0])
  }, [])

  // Poll job status and auto-summarize when parsing completes
  useEffect(() => {
    if (!job || job.status === 'FAILED') return
    
    // When COMPLETED, trigger summarization
    if (job.status === 'COMPLETED' && summarize.status === 'idle') {
      runSummarization()
      return
    }
    
    if (job.status === 'COMPLETED') return

    const interval = setInterval(async () => {
      const res = await fetch(`/api/analyze?jobId=${job.id}`)
      const updated = await res.json()
      setJob(updated)

      if (updated.status === 'COMPLETED' || updated.status === 'FAILED') {
        clearInterval(interval)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [job, summarize.status])

  // Run AI summarization on pending commits
  const runSummarization = async () => {
    if (!selectedRepo) return
    
    setSummarize({ status: 'processing', success: 0, failed: 0, total: 0 })
    
    let totalSuccess = 0
    let totalFailed = 0
    let hasMore = true
    
    while (hasMore) {
      try {
        const res = await fetch('/api/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repoId: selectedRepo }),
        })
        
        const data = await res.json()
        totalSuccess += data.success || 0
        totalFailed += data.failed || 0
        
        setSummarize({
          status: 'processing',
          success: totalSuccess,
          failed: totalFailed,
          total: totalSuccess + totalFailed,
        })
        
        // Stop if rate limited or no more commits
        if (data.rateLimited || (data.success || 0) + (data.failed || 0) === 0) {
          hasMore = false
        }
      } catch (err) {
        console.error('Summarization error:', err)
        hasMore = false
      }
    }
    
    setSummarize({
      status: 'completed',
      success: totalSuccess,
      failed: totalFailed,
      total: totalSuccess + totalFailed,
    })
  }

  const handleAnalyze = async () => {
    if (!selectedRepo) return

    setLoading(true)
    setSummarize({ status: 'idle', success: 0, failed: 0, total: 0 })
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repositoryId: selectedRepo,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          authorFilter: selectedAuthors.length > 0 ? selectedAuthors.join(',') : undefined,
        }),
      })

      const data = await res.json()
      setJob({ ...data, totalCommits: 0, processedCommits: 0, error: null })
    } catch (err) {
      console.error('Failed to start analysis:', err)
    } finally {
      setLoading(false)
    }
  }

  const progress = job
    ? job.totalCommits > 0
      ? Math.round((job.processedCommits / job.totalCommits) * 100)
      : 0
    : 0

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Analyze Repository</h1>
      <p className="text-gray-600">
        Parse git commits, generate AI summaries, and create zip files for each commit.
      </p>

      <div className="bg-white p-6 rounded-lg shadow space-y-4">
        <div>
          <label htmlFor="repo" className="block text-sm font-medium text-gray-700">
            Repository
          </label>
          <select
            id="repo"
            value={selectedRepo}
            onChange={(e) => setSelectedRepo(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
          >
            {repos.map((repo) => (
              <option key={repo.id} value={repo.id}>
                {repo.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">
              Start Date
            </label>
            <input
              type="date"
              id="startDate"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">
              End Date
            </label>
            <input
              type="date"
              id="endDate"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Author Filter (optional)
            </label>
            {authors.length > 0 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedAuthors(authors.map(a => a.email))}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Select all
                </button>
                <span className="text-gray-300">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedAuthors([])}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
          {authors.length > 0 ? (
            <div className="border rounded-lg p-3 bg-gray-50">
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {authors.map((author) => (
                  <label
                    key={author.email}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm cursor-pointer transition-colors ${
                      selectedAuthors.includes(author.email)
                        ? 'bg-purple-100 text-purple-800 border-2 border-purple-300'
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
          ) : (
            <p className="text-sm text-gray-500 italic">No authors found yet - run analysis first</p>
          )}
          {selectedAuthors.length > 0 && (
            <p className="mt-1 text-xs text-purple-600">
              {selectedAuthors.length} author(s) selected
            </p>
          )}
        </div>

        <button
          onClick={handleAnalyze}
          disabled={loading || !selectedRepo || Boolean(job && !['COMPLETED', 'FAILED'].includes(job.status))}
          className="w-full px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
        >
          {loading ? 'Starting...' : '🔍 Start Analysis'}
        </button>
      </div>

      {job && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Analysis Progress</h2>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Status: <strong>{job.status}</strong></span>
              <span>{job.processedCommits} / {job.totalCommits} commits</span>
            </div>

            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all ${
                  job.status === 'FAILED'
                    ? 'bg-red-600'
                    : job.status === 'COMPLETED'
                    ? 'bg-green-600'
                    : 'bg-blue-600'
                }`}
                style={{ width: `${progress}%` }}
              ></div>
            </div>

            {job.error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm">
                {job.error}
              </div>
            )}

            {job.status === 'COMPLETED' && (
              <div className="mt-4 space-y-3">
                {/* Summarization Progress */}
                {summarize.status === 'processing' && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded text-blue-700 text-sm">
                    <div className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>🤖 Generating AI summaries... {summarize.success} completed</span>
                    </div>
                  </div>
                )}
                
                {summarize.status === 'completed' && summarize.total > 0 && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
                    ✨ AI summaries generated: {summarize.success} successful
                    {summarize.failed > 0 && `, ${summarize.failed} failed`}
                  </div>
                )}
                
                {(summarize.status === 'completed' || summarize.total === 0) && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded text-green-600 text-sm">
                    ✅ Analysis completed! You can now{' '}
                    <a href="/exports/new" className="underline font-medium">
                      generate an export
                    </a>
                    .
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

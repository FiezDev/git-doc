'use client'

import { useState, useEffect } from 'react'

interface Repository {
  id: string
  name: string
}

interface Author {
  email: string
  name: string
  commitCount: number
}

interface SummarizeStatus {
  pending: number
  summarizing: boolean
  lastResult?: { success: number; failed: number }
}

export default function NewExportPage() {
  const [repos, setRepos] = useState<Repository[]>([])
  const [selectedRepos, setSelectedRepos] = useState<string[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([])
  const [authors, setAuthors] = useState<Author[]>([])
  const [loading, setLoading] = useState(false)
  const [summarizeStatus, setSummarizeStatus] = useState<SummarizeStatus>({ pending: 0, summarizing: false })
  const [result, setResult] = useState<{
    exportId: string
    fileName: string
    rowCount: number
    downloadUrl: string
  } | null>(null)

  useEffect(() => {
    fetch('/api/repos')
      .then((res) => res.json())
      .then((data) => setRepos(data))

    // Load all authors (no repo filter)
    fetch('/api/authors')
      .then((res) => res.json())
      .then((data: Author[]) => setAuthors(data))

    // Set default date range to current year
    const now = new Date()
    const yearStart = new Date(now.getFullYear(), 0, 1)
    setStartDate(yearStart.toISOString().split('T')[0])
    setEndDate(now.toISOString().split('T')[0])
  }, [])

  // Reload authors when selected repos change
  useEffect(() => {
    if (selectedRepos.length === 0) {
      // Load all authors
      fetch('/api/authors')
        .then((res) => res.json())
        .then((data: Author[]) => setAuthors(data))
    } else if (selectedRepos.length === 1) {
      // Load authors for single repo
      fetch(`/api/authors?repoId=${selectedRepos[0]}`)
        .then((res) => res.json())
        .then((data: Author[]) => setAuthors(data))
    } else {
      // For multiple repos, load all authors (could optimize later)
      fetch('/api/authors')
        .then((res) => res.json())
        .then((data: Author[]) => setAuthors(data))
    }
  }, [selectedRepos])

  const handleExport = async () => {
    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoIds: selectedRepos.length > 0 ? selectedRepos : undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          authorEmails: selectedAuthors.length > 0 ? selectedAuthors : undefined,
        }),
      })

      if (res.ok) {
        // Get filename from Content-Disposition header
        const contentDisposition = res.headers.get('Content-Disposition')
        const filenameMatch = contentDisposition?.match(/filename="(.+)"/)
        const fileName = filenameMatch ? filenameMatch[1] : `git-summary-${new Date().toISOString().slice(0, 10)}.xlsx`

        // Download the Excel file blob
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)

        setResult({
          exportId: 'downloaded',
          fileName,
          rowCount: 0, // We don't know the exact count from blob
          downloadUrl: '',
        })
      } else {
        const data = await res.json()
        alert(data.error || 'Export failed')
      }
    } catch (err) {
      console.error('Export failed:', err)
      alert('Export failed')
    } finally {
      setLoading(false)
    }
  }

  // Check for pending summaries
  const checkPendingSummaries = async () => {
    try {
      const params = new URLSearchParams()
      if (selectedRepos.length === 1) {
        params.set('repoId', selectedRepos[0])
      }
      params.set('status', 'PENDING')
      const res = await fetch(`/api/commits?${params.toString()}`)
      const data = await res.json()
      setSummarizeStatus(prev => ({ ...prev, pending: data.pagination?.total || 0 }))
    } catch (err) {
      console.error('Failed to check pending:', err)
    }
  }

  // Run AI summarization
  const runSummarization = async () => {
    setSummarizeStatus(prev => ({ ...prev, summarizing: true }))
    
    let totalSuccess = 0
    let totalFailed = 0
    let hasMore = true
    
    while (hasMore) {
      try {
        const body: { repoId?: string } = {}
        if (selectedRepos.length === 1) {
          body.repoId = selectedRepos[0]
        }
        
        const res = await fetch('/api/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        
        const data = await res.json()
        totalSuccess += data.success || 0
        totalFailed += data.failed || 0
        
        // Stop if rate limited or no more commits
        if (data.rateLimited || (data.success || 0) + (data.failed || 0) === 0) {
          hasMore = false
        }
      } catch (err) {
        console.error('Summarization error:', err)
        hasMore = false
      }
    }
    
    // Refresh pending count
    await checkPendingSummaries()
    
    setSummarizeStatus(prev => ({
      ...prev,
      summarizing: false,
      lastResult: { success: totalSuccess, failed: totalFailed },
    }))
  }

  // Check pending on mount and when repos change
  useEffect(() => {
    checkPendingSummaries()
  }, [selectedRepos])

  const toggleRepo = (repoId: string) => {
    setSelectedRepos((prev) =>
      prev.includes(repoId) ? prev.filter((id) => id !== repoId) : [...prev, repoId]
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Generate Excel Export</h1>
      <p className="text-gray-600">
        Export your git commits to an Excel file with AI-generated summaries.
      </p>

      <div className="bg-white p-6 rounded-lg shadow space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Repositories (select none for all)
          </label>
          <div className="space-y-2 max-h-48 overflow-y-auto border rounded p-2">
            {repos.map((repo) => (
              <label key={repo.id} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={selectedRepos.includes(repo.id)}
                  onChange={() => toggleRepo(repo.id)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm">{repo.name}</span>
              </label>
            ))}
          </div>
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
                        ? 'bg-orange-100 text-orange-800 border-2 border-orange-300'
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
            <p className="text-sm text-gray-500 italic">No authors found yet</p>
          )}
          {selectedAuthors.length > 0 && (
            <p className="mt-1 text-xs text-orange-600">
              {selectedAuthors.length} author(s) selected
            </p>
          )}
        </div>

        {/* Pending Summaries Alert */}
        {summarizeStatus.pending > 0 && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="text-sm text-yellow-800">
                ⚠️ {summarizeStatus.pending} commits have pending AI summaries
              </div>
              <button
                onClick={runSummarization}
                disabled={summarizeStatus.summarizing}
                className="px-3 py-1 text-xs font-medium text-yellow-800 bg-yellow-200 rounded hover:bg-yellow-300 disabled:opacity-50"
              >
                {summarizeStatus.summarizing ? 'Summarizing...' : '🤖 Generate Summaries'}
              </button>
            </div>
          </div>
        )}
        
        {summarizeStatus.summarizing && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-blue-700">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Generating AI summaries... This may take a moment.</span>
            </div>
          </div>
        )}
        
        {summarizeStatus.lastResult && !summarizeStatus.summarizing && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            ✅ Summarization complete: {summarizeStatus.lastResult.success} successful
            {summarizeStatus.lastResult.failed > 0 && `, ${summarizeStatus.lastResult.failed} failed`}
          </div>
        )}

        <button
          onClick={handleExport}
          disabled={loading || summarizeStatus.summarizing}
          className="w-full px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50"
        >
          {loading ? 'Generating...' : '📥 Generate Excel Export'}
        </button>
      </div>

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h2 className="text-lg font-medium text-green-800 mb-4">✅ Export Ready!</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-600">File Name:</dt>
              <dd className="font-medium">{result.fileName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Rows:</dt>
              <dd className="font-medium">{result.rowCount} commits</dd>
            </div>
          </dl>
          <a
            href={result.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 block w-full text-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700"
          >
            📥 Download Excel File
          </a>
        </div>
      )}

      {/* Excel Column Preview */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Excel Columns</h2>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>📅 <strong>Date/Time</strong> - When the commit was created</li>
          <li>📁 <strong>Repository</strong> - Which repo the commit belongs to</li>
          <li>📝 <strong>Summary of Change</strong> - AI-generated human-readable summary</li>
          <li>🏷️ <strong>Commit Name</strong> - First line of commit message</li>
          <li>📄 <strong>Commit Description</strong> - Full commit message</li>
          <li>💻 <strong>Code Change Summary</strong> - Files changed with additions/deletions</li>
          <li>📦 <strong>Code Zip Link</strong> - Download link for changed files</li>
          <li>🔗 <strong>JIRA Link</strong> - Extracted JIRA ticket URL (if found)</li>
        </ul>
      </div>
    </div>
  )
}

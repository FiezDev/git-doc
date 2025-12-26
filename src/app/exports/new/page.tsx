'use client'

import { useState, useEffect } from 'react'

interface Repository {
  id: string
  name: string
}

export default function NewExportPage() {
  const [repos, setRepos] = useState<Repository[]>([])
  const [selectedRepos, setSelectedRepos] = useState<string[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [authorFilter, setAuthorFilter] = useState('')
  const [loading, setLoading] = useState(false)
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

    // Set default date range to current year
    const now = new Date()
    const yearStart = new Date(now.getFullYear(), 0, 1)
    setStartDate(yearStart.toISOString().split('T')[0])
    setEndDate(now.toISOString().split('T')[0])
  }, [])

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
          authorEmail: authorFilter || undefined,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setResult(data)
      } else {
        alert(data.error || 'Export failed')
      }
    } catch (err) {
      console.error('Export failed:', err)
      alert('Export failed')
    } finally {
      setLoading(false)
    }
  }

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
          <label htmlFor="author" className="block text-sm font-medium text-gray-700">
            Author Filter (optional)
          </label>
          <input
            type="text"
            id="author"
            value={authorFilter}
            onChange={(e) => setAuthorFilter(e.target.value)}
            placeholder="email@example.com"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
          />
        </div>

        <button
          onClick={handleExport}
          disabled={loading}
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

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

export default function NewExportPage() {
  const [repos, setRepos] = useState<Repository[]>([])
  const [selectedRepos, setSelectedRepos] = useState<string[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([])
  const [authors, setAuthors] = useState<Author[]>([])
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

  const toggleRepo = (repoId: string) => {
    setSelectedRepos((prev) =>
      prev.includes(repoId) ? prev.filter((id) => id !== repoId) : [...prev, repoId]
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Generate Excel Export</h1>
      <p className="text-gray-600">
        Export commits to Excel with a File Summary sheet showing changes per file over time.
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

        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          📊 Export includes 2 sheets: <strong>Git Commits</strong> (raw data) and <strong>File Summary</strong> (changes per file over time)
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
          <h2 className="text-lg font-medium text-green-800 mb-4">✅ Export Downloaded!</h2>
          <p className="text-sm text-green-700">
            File <strong>{result.fileName}</strong> has been downloaded to your computer.
          </p>
        </div>
      )}

      {/* Excel Sheet Preview */}
      <div className="bg-white p-6 rounded-lg shadow space-y-4">
        <h2 className="text-lg font-medium text-gray-900">📊 Export Contents</h2>
        
        <div>
          <h3 className="text-md font-medium text-blue-700 mb-2">Sheet 1: Git Commits</h3>
          <ul className="text-sm text-gray-600 space-y-1 ml-4">
            <li>📅 Date/Time</li>
            <li>📁 Repository</li>
            <li>🏷️ Commit Name</li>
            <li>📄 Commit Description</li>
            <li>💻 Commit Code (SHA)</li>
            <li>📂 Changed Files</li>
            <li>🔢 Files Count</li>
            <li>🔗 JIRA Link</li>
            <li>👤 Author</li>
          </ul>
        </div>
        
        <div>
          <h3 className="text-md font-medium text-green-700 mb-2">Sheet 2: File Summary</h3>
          <p className="text-sm text-gray-600 mb-2">Groups all changes by file path showing version history:</p>
          <div className="text-sm bg-gray-50 p-3 rounded border font-mono">
            <div className="text-gray-800">
              <strong>File</strong>: /src/app/page.tsx<br/>
              <strong>Changes</strong>:<br/>
              &nbsp;&nbsp;27/12/2025<br/>
              &nbsp;&nbsp;- feat: add new component<br/>
              &nbsp;&nbsp;- fix: button styling<br/>
              <br/>
              &nbsp;&nbsp;25/12/2025<br/>
              &nbsp;&nbsp;- initial page setup
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

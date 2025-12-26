'use client'

import { useState, useEffect } from 'react'

interface Export {
  id: string
  status: string
  fileName: string | null
  fileSize: number | null
  rowCount: number | null
  createdAt: string
  completedAt: string | null
}

export default function ExportsPage() {
  const [exports, setExports] = useState<Export[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/export')
      .then((res) => res.json())
      .then((data) => {
        setExports(data)
        setLoading(false)
      })
  }, [])

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  if (loading) {
    return <div className="animate-pulse">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Export History</h1>
        <a
          href="/exports/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700"
        >
          📥 New Export
        </a>
      </div>

      {exports.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <p className="text-gray-500">No exports generated yet.</p>
          <p className="text-sm text-gray-400 mt-2">
            Generate your first export to see it here.
          </p>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {exports.map((exp) => (
              <li key={exp.id}>
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="text-2xl mr-3">
                        {exp.status === 'COMPLETED'
                          ? '✅'
                          : exp.status === 'FAILED'
                          ? '❌'
                          : '⏳'}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {exp.fileName || 'Processing...'}
                        </p>
                        <p className="text-sm text-gray-500">
                          {exp.rowCount ? `${exp.rowCount} commits` : ''}
                          {exp.fileSize ? ` • ${formatBytes(exp.fileSize)}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span
                        className={`px-2 py-1 text-xs rounded ${
                          exp.status === 'COMPLETED'
                            ? 'bg-green-100 text-green-800'
                            : exp.status === 'FAILED'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {exp.status}
                      </span>
                      <span className="text-sm text-gray-400">
                        {new Date(exp.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

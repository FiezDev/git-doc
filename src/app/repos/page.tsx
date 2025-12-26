'use client'

import { useState, useEffect } from 'react'

interface Repository {
  id: string
  name: string
  url: string
  branch: string
  lastSyncAt: string | null
  createdAt: string
  credential: { id: string; name: string; type: string } | null
  _count: { commits: number }
}

export default function ReposPage() {
  const [repos, setRepos] = useState<Repository[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/repos')
      .then((res) => res.json())
      .then((data) => {
        setRepos(data)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return <div className="animate-pulse">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Repositories</h1>
        <a
          href="/repos/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
        >
          ➕ Add Repository
        </a>
      </div>

      {repos.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <p className="text-gray-500">No repositories added yet.</p>
          <p className="text-sm text-gray-400 mt-2">
            Add your Git repositories to start analyzing commits.
          </p>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {repos.map((repo) => (
              <li key={repo.id}>
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="text-2xl mr-3">📁</span>
                      <div>
                        <p className="text-sm font-medium text-blue-600">{repo.name}</p>
                        <p className="text-sm text-gray-500 font-mono">{repo.url}</p>
                        <p className="text-xs text-gray-400">
                          Branch: {repo.branch}
                          {repo.credential && ` • Using: ${repo.credential.name}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className="text-sm text-gray-500">
                        {repo._count.commits} commits
                      </span>
                      {repo.lastSyncAt && (
                        <span className="text-sm text-gray-400">
                          Synced {new Date(repo.lastSyncAt).toLocaleDateString()}
                        </span>
                      )}
                      <a
                        href={`/analyze?repoId=${repo.id}`}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Analyze
                      </a>
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

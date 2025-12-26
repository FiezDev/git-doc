'use client'

import { useState, useEffect } from 'react'

interface Credential {
  id: string
  name: string
  type: string
}

interface Repository {
  id: string
  name: string
  url: string
  branch: string
  lastSyncAt: string | null
  createdAt: string
  credentialId: string | null
  credential: Credential | null
  _count: { commits: number }
}

export default function ReposPage() {
  const [repos, setRepos] = useState<Repository[]>([])
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', url: '', branch: '', credentialId: '' })
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const loadRepos = () => {
    fetch('/api/repos')
      .then((res) => res.json())
      .then((data) => {
        setRepos(data)
        setLoading(false)
      })
  }

  useEffect(() => {
    loadRepos()
    // Load credentials for the dropdown
    fetch('/api/credentials')
      .then((res) => res.json())
      .then((data) => setCredentials(data))
  }, [])

  const handleEdit = (repo: Repository) => {
    setEditingId(repo.id)
    setEditForm({
      name: repo.name,
      url: repo.url,
      branch: repo.branch,
      credentialId: repo.credentialId || '',
    })
  }

  const handleSaveEdit = async () => {
    if (!editingId) return

    const res = await fetch(`/api/repos/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editForm.name,
        url: editForm.url,
        branch: editForm.branch,
        credentialId: editForm.credentialId || null,
      }),
    })

    if (res.ok) {
      setEditingId(null)
      loadRepos()
    } else {
      const data = await res.json()
      alert(data.error || 'Failed to update')
    }
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/repos/${id}`, {
      method: 'DELETE',
    })

    if (res.ok) {
      setDeleteConfirm(null)
      loadRepos()
    } else {
      const data = await res.json()
      alert(data.error || 'Failed to delete')
    }
  }

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
                {editingId === repo.id ? (
                  // Edit Mode
                  <div className="px-4 py-4 sm:px-6 bg-blue-50">
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Name</label>
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">URL</label>
                        <input
                          type="url"
                          value={editForm.url}
                          onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Branch</label>
                        <input
                          type="text"
                          value={editForm.branch}
                          onChange={(e) => setEditForm({ ...editForm, branch: e.target.value })}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Credential</label>
                        <select
                          value={editForm.credentialId}
                          onChange={(e) => setEditForm({ ...editForm, credentialId: e.target.value })}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                        >
                          <option value="">No credential</option>
                          {credentials.map((cred) => (
                            <option key={cred.id} value={cred.id}>
                              {cred.name} ({cred.type})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={handleSaveEdit}
                          className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                        >
                          💾 Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1 bg-gray-400 text-white rounded text-sm hover:bg-gray-500"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : deleteConfirm === repo.id ? (
                  // Delete Confirmation
                  <div className="px-4 py-4 sm:px-6 bg-red-50">
                    <p className="text-sm text-red-800">
                      Are you sure you want to delete <strong>{repo.name}</strong>?
                      {repo._count.commits > 0 && (
                        <span className="block mt-1">
                          This will also delete {repo._count.commits} commit records.
                        </span>
                      )}
                    </p>
                    <div className="mt-2 flex space-x-2">
                      <button
                        onClick={() => handleDelete(repo.id)}
                        className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                      >
                        🗑️ Yes, Delete
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="px-3 py-1 bg-gray-400 text-white rounded text-sm hover:bg-gray-500"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  // Normal View
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
                          className="text-sm text-purple-600 hover:text-purple-800"
                        >
                          🔍 Analyze
                        </a>
                        <button
                          onClick={() => handleEdit(repo)}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(repo.id)}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'

interface Credential {
  id: string
  name: string
  type: string
  username: string | null
  createdAt: string
  _count: { repositories: number }
}

export default function CredentialsPage() {
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', token: '', username: '' })
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const loadCredentials = () => {
    fetch('/api/credentials')
      .then((res) => res.json())
      .then((data) => {
        setCredentials(data)
        setLoading(false)
      })
  }

  useEffect(() => {
    loadCredentials()
  }, [])

  const handleEdit = (cred: Credential) => {
    setEditingId(cred.id)
    setEditForm({
      name: cred.name,
      token: '', // Don't prefill token for security
      username: cred.username || '',
    })
  }

  const handleSaveEdit = async () => {
    if (!editingId) return

    const updateData: Record<string, string> = {}
    if (editForm.name) updateData.name = editForm.name
    if (editForm.token) updateData.token = editForm.token
    if (editForm.username) updateData.username = editForm.username

    const res = await fetch(`/api/credentials/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData),
    })

    if (res.ok) {
      setEditingId(null)
      loadCredentials()
    } else {
      const data = await res.json()
      alert(data.error || 'Failed to update')
    }
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/credentials/${id}`, {
      method: 'DELETE',
    })

    if (res.ok) {
      setDeleteConfirm(null)
      loadCredentials()
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
        <h1 className="text-3xl font-bold text-gray-900">Git Credentials</h1>
        <a
          href="/credentials/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
        >
          ➕ Add Credential
        </a>
      </div>

      {credentials.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <p className="text-gray-500">No credentials added yet.</p>
          <p className="text-sm text-gray-400 mt-2">
            Add your Git credentials to start analyzing repositories.
          </p>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {credentials.map((cred) => (
              <li key={cred.id}>
                {editingId === cred.id ? (
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
                        <label className="block text-sm font-medium text-gray-700">
                          New Token (leave blank to keep existing)
                        </label>
                        <input
                          type="password"
                          value={editForm.token}
                          onChange={(e) => setEditForm({ ...editForm, token: e.target.value })}
                          placeholder="ghp_xxxx..."
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Username</label>
                        <input
                          type="text"
                          value={editForm.username}
                          onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                        />
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
                ) : deleteConfirm === cred.id ? (
                  // Delete Confirmation
                  <div className="px-4 py-4 sm:px-6 bg-red-50">
                    <p className="text-sm text-red-800">
                      Are you sure you want to delete <strong>{cred.name}</strong>?
                    </p>
                    <div className="mt-2 flex space-x-2">
                      <button
                        onClick={() => handleDelete(cred.id)}
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
                        <span className="text-2xl mr-3">
                          {cred.type === 'PAT' ? '🔑' : cred.type === 'SSH' ? '🔐' : '🔓'}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-blue-600">{cred.name}</p>
                          <p className="text-sm text-gray-500">
                            {cred.type} {cred.username && `• ${cred.username}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className="text-sm text-gray-500">
                          {cred._count.repositories} repos
                        </span>
                        <span className="text-sm text-gray-400">
                          Created {new Date(cred.createdAt).toLocaleDateString()}
                        </span>
                        <button
                          onClick={() => handleEdit(cred)}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(cred.id)}
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

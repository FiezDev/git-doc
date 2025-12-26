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

  useEffect(() => {
    fetch('/api/credentials')
      .then((res) => res.json())
      .then((data) => {
        setCredentials(data)
        setLoading(false)
      })
  }, [])

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

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Credential {
  id: string
  name: string
  type: string
}

export default function NewRepoPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [credentials, setCredentials] = useState<Credential[]>([])

  useEffect(() => {
    fetch('/api/credentials')
      .then((res) => res.json())
      .then((data) => setCredentials(data))
  }, [])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const formData = new FormData(e.currentTarget)
    const data = {
      name: formData.get('name'),
      url: formData.get('url'),
      branch: formData.get('branch') || 'main',
      credentialId: formData.get('credentialId') || undefined,
    }

    try {
      const res = await fetch('/api/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create repository')
      }

      router.push('/repos')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Add Repository</h1>

      <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">
            Display Name
          </label>
          <input
            type="text"
            name="name"
            id="name"
            required
            placeholder="My Project, Backend API, etc."
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="url" className="block text-sm font-medium text-gray-700">
            Repository URL
          </label>
          <input
            type="url"
            name="url"
            id="url"
            required
            placeholder="https://github.com/user/repo.git"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2 font-mono"
          />
        </div>

        <div>
          <label htmlFor="branch" className="block text-sm font-medium text-gray-700">
            Branch
          </label>
          <input
            type="text"
            name="branch"
            id="branch"
            defaultValue="main"
            placeholder="main"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="credentialId" className="block text-sm font-medium text-gray-700">
            Credential (for private repos)
          </label>
          <select
            name="credentialId"
            id="credentialId"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
          >
            <option value="">None (public repo)</option>
            {credentials.map((cred) => (
              <option key={cred.id} value={cred.id}>
                {cred.name} ({cred.type})
              </option>
            ))}
          </select>
          {credentials.length === 0 && (
            <p className="mt-1 text-sm text-gray-500">
              <a href="/credentials/new" className="text-blue-600 hover:underline">
                Add a credential
              </a>{' '}
              for private repositories
            </p>
          )}
        </div>

        <div className="flex justify-end space-x-3">
          <a
            href="/repos"
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </a>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Add Repository'}
          </button>
        </div>
      </form>
    </div>
  )
}

import Link from 'next/link'
import { prisma } from '@/lib/prisma'

export default async function HomePage() {
  const [repoCount, commitCount, exportCount] = await Promise.all([
    prisma.repository.count(),
    prisma.commit.count(),
    prisma.exportJob.count({ where: { status: 'COMPLETED' } }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Summarize your yearly git work across multiple repositories
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <span className="text-3xl">📁</span>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Repositories
                  </dt>
                  <dd className="text-lg font-semibold text-gray-900">
                    {repoCount}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <span className="text-3xl">📝</span>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Commits Analyzed
                  </dt>
                  <dd className="text-lg font-semibold text-gray-900">
                    {commitCount}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <span className="text-3xl">📊</span>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Exports Generated
                  </dt>
                  <dd className="text-lg font-semibold text-gray-900">
                    {exportCount}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/repos/new"
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            ➕ Add Repository
          </Link>
          <Link
            href="/credentials/new"
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
          >
            🔑 Add Credentials
          </Link>
          <Link
            href="/analyze"
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
          >
            🔍 Analyze Commits
          </Link>
          <Link
            href="/exports/new"
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700"
          >
            📥 Generate Export
          </Link>
        </div>
      </div>

      {/* Workflow Guide */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">How It Works</h2>
        <div className="space-y-4">
          <div className="flex items-start">
            <span className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-600 font-bold text-sm">1</span>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-900">Add Git Credentials</h3>
              <p className="text-sm text-gray-500">Add your GitHub/GitLab PAT or SSH keys for repository access</p>
            </div>
          </div>
          <div className="flex items-start">
            <span className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-600 font-bold text-sm">2</span>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-900">Add Repositories</h3>
              <p className="text-sm text-gray-500">Register the git repositories you want to analyze</p>
            </div>
          </div>
          <div className="flex items-start">
            <span className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-600 font-bold text-sm">3</span>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-900">Analyze Commits</h3>
              <p className="text-sm text-gray-500">Run analysis to parse commits, generate AI summaries, and create zip files</p>
            </div>
          </div>
          <div className="flex items-start">
            <span className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-600 font-bold text-sm">4</span>
            <div className="ml-4">
              <h3 className="text-sm font-medium text-gray-900">Export to Excel</h3>
              <p className="text-sm text-gray-500">Generate Excel report with all commit data, summaries, and download links</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

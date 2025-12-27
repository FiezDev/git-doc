import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { summarizeCommit } from '@/lib/ai'
import { z } from 'zod'

const summarizeSchema = z.object({
  commitIds: z.array(z.string()).optional(),
  repoId: z.string().optional(),
})

// POST - Generate AI summaries for commits
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = summarizeSchema.parse(body)

    // Find commits that need summaries
    interface CommitWhereInput {
      id?: { in: string[] }
      repositoryId?: string
      summaryStatus: 'PENDING' | 'FAILED'
    }
    const where: CommitWhereInput = { summaryStatus: 'PENDING' }

    if (data.commitIds && data.commitIds.length > 0) {
      where.id = { in: data.commitIds }
    }
    if (data.repoId) {
      where.repositoryId = data.repoId
    }

    const commits = await prisma.commit.findMany({
      where,
      take: 50, // Limit batch size
      orderBy: { commitDate: 'desc' },
    })

    if (commits.length === 0) {
      return NextResponse.json({ message: 'No commits need summarization', count: 0 })
    }

    // Generate summaries
    let successCount = 0
    let failCount = 0

    for (const commit of commits) {
      try {
        await prisma.commit.update({
          where: { id: commit.id },
          data: { summaryStatus: 'PROCESSING' },
        })

        const summary = await summarizeCommit({
          commitMessage: commit.message,
          changedPaths: commit.changedPaths || '',
          filesChanged: commit.filesChanged,
        })

        await prisma.commit.update({
          where: { id: commit.id },
          data: {
            summary,
            summaryStatus: 'COMPLETED',
          },
        })

        successCount++
      } catch (error) {
        console.error(`Failed to summarize commit ${commit.id}:`, error)
        await prisma.commit.update({
          where: { id: commit.id },
          data: { summaryStatus: 'FAILED' },
        })
        failCount++
      }
    }

    return NextResponse.json({
      message: 'Summarization complete',
      success: successCount,
      failed: failCount,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    console.error('Failed to summarize commits:', error)
    return NextResponse.json({ error: 'Failed to summarize commits' }, { status: 500 })
  }
}

// GET - Get summary status
export async function GET(request: NextRequest) {
  const repoId = request.nextUrl.searchParams.get('repoId')

  interface CountWhereInput {
    repositoryId?: string
  }
  const where: CountWhereInput = {}
  if (repoId) where.repositoryId = repoId

  const [pending, processing, completed, failed] = await Promise.all([
    prisma.commit.count({ where: { ...where, summaryStatus: 'PENDING' } }),
    prisma.commit.count({ where: { ...where, summaryStatus: 'PROCESSING' } }),
    prisma.commit.count({ where: { ...where, summaryStatus: 'COMPLETED' } }),
    prisma.commit.count({ where: { ...where, summaryStatus: 'FAILED' } }),
  ])

  return NextResponse.json({
    pending,
    processing,
    completed,
    failed,
    total: pending + processing + completed + failed,
  })
}

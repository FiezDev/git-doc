import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - List commits with filters
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const repoId = searchParams.get('repoId')
    const authorEmail = searchParams.get('authorEmail')
    const authorEmails = searchParams.get('authorEmails') // comma-separated list
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const status = searchParams.get('status') // summaryStatus filter
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    interface CommitWhereInput {
      repositoryId?: string
      authorEmail?: { contains: string } | { in: string[] }
      commitDate?: { gte?: Date; lte?: Date }
      summaryStatus?: string
    }
    const where: CommitWhereInput = {}

    if (repoId) {
      where.repositoryId = repoId
    }

    // Support multiple authors (comma-separated) or single author
    if (authorEmails) {
      const emails = authorEmails.split(',').map(e => e.trim()).filter(Boolean)
      if (emails.length > 0) {
        where.authorEmail = { in: emails }
      }
    } else if (authorEmail) {
      where.authorEmail = { contains: authorEmail }
    }

    if (startDate || endDate) {
      where.commitDate = {}
      if (startDate) where.commitDate.gte = new Date(startDate)
      if (endDate) where.commitDate.lte = new Date(endDate)
    }

    if (status) {
      where.summaryStatus = status
    }

    const [commits, total] = await Promise.all([
      prisma.commit.findMany({
        where,
        include: {
          repository: { select: { id: true, name: true } },
        },
        orderBy: { commitDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.commit.count({ where }),
    ])

    return NextResponse.json({
      commits,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Failed to list commits:', error)
    return NextResponse.json({ error: 'Failed to list commits' }, { status: 500 })
  }
}

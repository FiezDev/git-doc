import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSignedDownloadUrl } from '@/lib/s3'

// GET - List commits with filters
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const repoId = searchParams.get('repoId')
    const authorEmail = searchParams.get('authorEmail')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    interface CommitWhereInput {
      repositoryId?: string
      authorEmail?: { contains: string }
      commitDate?: { gte?: Date; lte?: Date }
    }
    const where: CommitWhereInput = {}

    if (repoId) {
      where.repositoryId = repoId
    }

    if (authorEmail) {
      where.authorEmail = { contains: authorEmail }
    }

    if (startDate || endDate) {
      where.commitDate = {}
      if (startDate) where.commitDate.gte = new Date(startDate)
      if (endDate) where.commitDate.lte = new Date(endDate)
    }

    const [commits, total] = await Promise.all([
      prisma.commit.findMany({
        where,
        include: {
          repository: { select: { id: true, name: true } },
          changedFiles: { select: { filePath: true, changeType: true } },
        },
        orderBy: { commitDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.commit.count({ where }),
    ])

    // Generate signed URLs for zip files
    const commitsWithUrls = await Promise.all(
      commits.map(async (commit) => {
        let zipUrl = null
        if (commit.zipFileKey) {
          try {
            zipUrl = await getSignedDownloadUrl(commit.zipFileKey)
          } catch (err) {
            console.error('Failed to generate signed URL:', err)
          }
        }
        return { ...commit, zipUrl }
      })
    )

    return NextResponse.json({
      commits: commitsWithUrls,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('Failed to list commits:', error)
    return NextResponse.json({ error: 'Failed to list commits' }, { status: 500 })
  }
}

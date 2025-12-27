import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET - Get all unique authors for a repository or across all repositories
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const repoId = searchParams.get('repoId')

    interface WhereInput {
      repositoryId?: string
    }
    const where: WhereInput = {}

    if (repoId) {
      where.repositoryId = repoId
    }

    // Get unique authors with their commit counts
    const authors = await prisma.commit.groupBy({
      by: ['authorEmail', 'authorName'],
      where,
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
    })

    // Format the response
    const formattedAuthors = authors.map((author) => ({
      email: author.authorEmail,
      name: author.authorName,
      commitCount: author._count.id,
    }))

    return NextResponse.json(formattedAuthors)
  } catch (error) {
    console.error('Failed to get authors:', error)
    return NextResponse.json({ error: 'Failed to get authors' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createRepoSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  branch: z.string().default('main'),
  credentialId: z.string().optional(),
})

// GET - List all repositories
export async function GET() {
  try {
    const repositories = await prisma.repository.findMany({
      include: {
        credential: {
          select: { id: true, name: true, type: true },
        },
        _count: { select: { commits: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(repositories)
  } catch (error) {
    console.error('Failed to list repositories:', error)
    return NextResponse.json({ error: 'Failed to list repositories' }, { status: 500 })
  }
}

// POST - Create a new repository
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = createRepoSchema.parse(body)

    // Check if credential exists
    if (data.credentialId) {
      const credential = await prisma.credential.findUnique({
        where: { id: data.credentialId },
      })
      if (!credential) {
        return NextResponse.json({ error: 'Credential not found' }, { status: 400 })
      }
    }

    const repository = await prisma.repository.create({
      data: {
        name: data.name,
        url: data.url,
        branch: data.branch,
        credentialId: data.credentialId,
      },
    })

    return NextResponse.json(repository)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    console.error('Failed to create repository:', error)
    return NextResponse.json({ error: 'Failed to create repository' }, { status: 500 })
  }
}

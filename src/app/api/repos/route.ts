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
  console.log('[API /repos GET] Listing repositories...')
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
    console.log('[API /repos GET] Found', repositories.length, 'repositories')
    return NextResponse.json(repositories)
  } catch (error) {
    console.error('[API /repos GET] Failed:', error)
    return NextResponse.json({ error: 'Failed to list repositories' }, { status: 500 })
  }
}

// POST - Create a new repository
export async function POST(request: NextRequest) {
  console.log('[API /repos POST] Creating repository...')
  try {
    const body = await request.json()
    console.log('[API /repos POST] Body:', body)
    const data = createRepoSchema.parse(body)

    // Check if credential exists
    if (data.credentialId) {
      console.log('[API /repos POST] Checking credential:', data.credentialId)
      const credential = await prisma.credential.findUnique({
        where: { id: data.credentialId },
      })
      if (!credential) {
        console.log('[API /repos POST] Credential not found:', data.credentialId)
        return NextResponse.json({ error: 'Credential not found' }, { status: 400 })
      }
      console.log('[API /repos POST] Credential found:', credential.name)
    }

    const repository = await prisma.repository.create({
      data: {
        name: data.name,
        url: data.url,
        branch: data.branch,
        credentialId: data.credentialId,
      },
    })
    console.log('[API /repos POST] Created repository:', repository.id, repository.name)

    return NextResponse.json(repository)
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[API /repos POST] Validation error:', error.errors)
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    console.error('[API /repos POST] Failed:', error)
    return NextResponse.json({ error: 'Failed to create repository' }, { status: 500 })
  }
}

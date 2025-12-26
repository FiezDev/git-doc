import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createCredentialSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['PAT', 'SSH', 'OAUTH']),
  username: z.string().optional(),
  token: z.string().min(1),
  sshKeyPath: z.string().optional(),
})

// GET - List all credentials
export async function GET() {
  console.log('[API /credentials GET] Listing credentials...')
  try {
    const credentials = await prisma.credential.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        username: true,
        sshKeyPath: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { repositories: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    console.log('[API /credentials GET] Found', credentials.length, 'credentials')
    return NextResponse.json(credentials)
  } catch (error) {
    console.error('[API /credentials GET] Failed to list credentials:', error)
    return NextResponse.json({ error: 'Failed to list credentials' }, { status: 500 })
  }
}

// POST - Create a new credential
export async function POST(request: NextRequest) {
  console.log('[API /credentials POST] Creating credential...')
  try {
    const body = await request.json()
    console.log('[API /credentials POST] Body:', { ...body, token: '[REDACTED]' })
    const data = createCredentialSchema.parse(body)

    // In production, encrypt the token before storing
    const credential = await prisma.credential.create({
      data: {
        name: data.name,
        type: data.type,
        username: data.username,
        token: data.token, // TODO: Encrypt this
        sshKeyPath: data.sshKeyPath,
      },
    })
    console.log('[API /credentials POST] Created credential:', credential.id, credential.name)

    return NextResponse.json({
      id: credential.id,
      name: credential.name,
      type: credential.type,
      createdAt: credential.createdAt,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[API /credentials POST] Validation error:', error.errors)
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    console.error('Failed to create credential:', error)
    return NextResponse.json({ error: 'Failed to create credential' }, { status: 500 })
  }
}

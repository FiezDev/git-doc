import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateCredentialSchema = z.object({
  name: z.string().min(1).optional(),
  token: z.string().optional(),
  username: z.string().optional(),
})

// GET - Get single credential
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  const credential = await prisma.credential.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      username: true,
      token: true,
      sshKeyPath: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { repositories: true } },
    },
  })

  if (!credential) {
    return NextResponse.json({ error: 'Credential not found' }, { status: 404 })
  }

  // Mask token for security (show only first/last 4 chars)
  const maskedCredential = {
    ...credential,
    token: credential.token 
      ? `${credential.token.substring(0, 4)}...${credential.token.substring(credential.token.length - 4)}`
      : null,
  }

  return NextResponse.json(maskedCredential)
}

// PUT - Update credential
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    const body = await request.json()
    const data = updateCredentialSchema.parse(body)

    // Check if credential exists
    const existing = await prisma.credential.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Credential not found' }, { status: 404 })
    }

    // Build update data (only include fields that were provided)
    const updateData: Record<string, string> = {}
    if (data.name) updateData.name = data.name
    if (data.token) updateData.token = data.token
    if (data.username !== undefined) updateData.username = data.username

    const credential = await prisma.credential.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      id: credential.id,
      name: credential.name,
      type: credential.type,
      message: 'Credential updated successfully',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    console.error('Failed to update credential:', error)
    return NextResponse.json({ error: 'Failed to update credential' }, { status: 500 })
  }
}

// DELETE - Delete credential
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    // Check if credential exists and has repos
    const credential = await prisma.credential.findUnique({
      where: { id },
      include: { _count: { select: { repositories: true } } },
    })

    if (!credential) {
      return NextResponse.json({ error: 'Credential not found' }, { status: 404 })
    }

    if (credential._count.repositories > 0) {
      return NextResponse.json(
        { error: `Cannot delete credential. It is used by ${credential._count.repositories} repository(s). Remove the repositories first.` },
        { status: 400 }
      )
    }

    await prisma.credential.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Credential deleted successfully' })
  } catch (error) {
    console.error('Failed to delete credential:', error)
    return NextResponse.json({ error: 'Failed to delete credential' }, { status: 500 })
  }
}

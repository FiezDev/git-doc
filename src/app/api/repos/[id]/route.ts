import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateRepoSchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().url().optional(),
  branch: z.string().optional(),
  credentialId: z.string().optional().nullable(),
})

// GET - Get single repository
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  const repository = await prisma.repository.findUnique({
    where: { id },
    include: {
      credential: {
        select: { id: true, name: true, type: true },
      },
      _count: { select: { commits: true } },
    },
  })

  if (!repository) {
    return NextResponse.json({ error: 'Repository not found' }, { status: 404 })
  }

  return NextResponse.json(repository)
}

// PUT - Update repository
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    const body = await request.json()
    const data = updateRepoSchema.parse(body)

    // Check if repository exists
    const existing = await prisma.repository.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 })
    }

    // If credentialId is provided, verify it exists
    if (data.credentialId) {
      const credential = await prisma.credential.findUnique({
        where: { id: data.credentialId },
      })
      if (!credential) {
        return NextResponse.json({ error: 'Credential not found' }, { status: 400 })
      }
    }

    // Build update data
    const updateData: Record<string, string | null> = {}
    if (data.name) updateData.name = data.name
    if (data.url) updateData.url = data.url
    if (data.branch) updateData.branch = data.branch
    if (data.credentialId !== undefined) updateData.credentialId = data.credentialId

    const repository = await prisma.repository.update({
      where: { id },
      data: updateData,
      include: {
        credential: { select: { id: true, name: true, type: true } },
      },
    })

    return NextResponse.json({
      ...repository,
      message: 'Repository updated successfully',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    console.error('Failed to update repository:', error)
    return NextResponse.json({ error: 'Failed to update repository' }, { status: 500 })
  }
}

// DELETE - Delete repository
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    // Check if repository exists
    const repository = await prisma.repository.findUnique({
      where: { id },
      include: { _count: { select: { commits: true, analysisJobs: true } } },
    })

    if (!repository) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 })
    }

    // Delete related data first (cascading delete)
    // Delete commits and their changed files
    await prisma.changedFile.deleteMany({
      where: { commit: { repositoryId: id } },
    })
    await prisma.commit.deleteMany({
      where: { repositoryId: id },
    })
    
    // Delete analysis jobs
    await prisma.analysisJob.deleteMany({
      where: { repositoryId: id },
    })

    // Finally delete the repository
    await prisma.repository.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Repository deleted successfully' })
  } catch (error) {
    console.error('Failed to delete repository:', error)
    return NextResponse.json({ error: 'Failed to delete repository' }, { status: 500 })
  }
}

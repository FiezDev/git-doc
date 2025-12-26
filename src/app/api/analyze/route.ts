import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const analyzeSchema = z.object({
  repositoryId: z.string(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  authorFilter: z.string().optional(),
})

// POST - Start analysis job
export async function POST(request: NextRequest) {
  console.log('[API /analyze POST] Starting...')
  try {
    const body = await request.json()
    console.log('[API /analyze POST] Request body:', JSON.stringify(body, null, 2))
    const data = analyzeSchema.parse(body)

    // Check if repository exists
    console.log('[API /analyze POST] Looking for repository:', data.repositoryId)
    const repository = await prisma.repository.findUnique({
      where: { id: data.repositoryId },
      include: { credential: true },
    })

    if (!repository) {
      console.log('[API /analyze POST] Repository not found:', data.repositoryId)
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 })
    }
    console.log('[API /analyze POST] Found repository:', repository.name, repository.url)
    console.log('[API /analyze POST] Credential:', repository.credential?.id, 'Token present:', !!repository.credential?.token)

    // Create analysis job
    const job = await prisma.analysisJob.create({
      data: {
        repositoryId: data.repositoryId,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        authorFilter: data.authorFilter,
        status: 'PENDING',
      },
    })
    console.log('[API /analyze POST] Created job:', job.id)

    // Trigger Rust service to process the job
    const rustServiceUrl = process.env.RUST_SERVICE_URL || 'http://localhost:8080'
    console.log('[API /analyze POST] Calling Rust service at:', rustServiceUrl)
    
    fetch(`${rustServiceUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: job.id,
        repoUrl: repository.url,
        branch: repository.branch,
        credentialToken: repository.credential?.token,
        startDate: data.startDate,
        endDate: data.endDate,
        authorFilter: data.authorFilter,
      }),
    })
      .then((res) => {
        console.log('[API /analyze POST] Rust service response status:', res.status)
        return res.text()
      })
      .then((text) => {
        console.log('[API /analyze POST] Rust service response:', text)
      })
      .catch((err) => {
        console.error('[API /analyze POST] Failed to trigger Rust service:', err)
      })

    return NextResponse.json({
      id: job.id,
      status: job.status,
      message: 'Analysis job started',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[API /analyze POST] Validation error:', error.errors)
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    console.error('[API /analyze POST] Failed to start analysis:', error)
    return NextResponse.json({ error: 'Failed to start analysis' }, { status: 500 })
  }
}

// GET - Get analysis job status
export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get('jobId')
  console.log('[API /analyze GET] jobId:', jobId)

  if (!jobId) {
    // List all jobs
    console.log('[API /analyze GET] Listing all jobs')
    const jobs = await prisma.analysisJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    console.log('[API /analyze GET] Found', jobs.length, 'jobs')
    return NextResponse.json(jobs)
  }

  console.log('[API /analyze GET] Looking for job:', jobId)
  const job = await prisma.analysisJob.findUnique({
    where: { id: jobId },
  })

  if (!job) {
    console.log('[API /analyze GET] Job not found:', jobId)
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  console.log('[API /analyze GET] Found job:', job.id, 'status:', job.status)
  return NextResponse.json(job)
}

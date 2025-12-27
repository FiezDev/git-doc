import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import ExcelJS from 'exceljs'
import { format } from 'date-fns'

const exportSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  authorEmail: z.string().optional(),
  repoIds: z.array(z.string()).optional(),
})

// POST - Create export and return Excel file directly
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = exportSchema.parse(body)

    // Build query filter
    interface CommitWhereInput {
      authorEmail?: { contains: string }
      commitDate?: { gte?: Date; lte?: Date }
      repositoryId?: { in: string[] }
    }
    const where: CommitWhereInput = {}

    if (data.authorEmail) {
      where.authorEmail = { contains: data.authorEmail }
    }

    if (data.startDate || data.endDate) {
      where.commitDate = {}
      if (data.startDate) where.commitDate.gte = new Date(data.startDate)
      if (data.endDate) where.commitDate.lte = new Date(data.endDate)
    }

    if (data.repoIds && data.repoIds.length > 0) {
      where.repositoryId = { in: data.repoIds }
    }

    const commits = await prisma.commit.findMany({
      where,
      include: {
        repository: { select: { name: true, url: true } },
      },
      orderBy: { commitDate: 'desc' },
    })

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Git Work Summarizer'
    workbook.created = new Date()

    const worksheet = workbook.addWorksheet('Git Commits', {
      views: [{ state: 'frozen', ySplit: 1 }],
    })

    // Define columns matching the simplified requirements
    worksheet.columns = [
      { header: 'Date Time', key: 'dateTime', width: 20 },
      { header: 'Repository', key: 'repository', width: 25 },
      { header: 'Summary of Change', key: 'summary', width: 60 },
      { header: 'Commit Name', key: 'commitName', width: 40 },
      { header: 'Commit Description', key: 'commitDesc', width: 50 },
      { header: 'Commit Code', key: 'commitCode', width: 15 },
      { header: 'Changed Files', key: 'changedFiles', width: 50 },
      { header: 'Files Count', key: 'filesCount', width: 12 },
      { header: 'JIRA Link', key: 'jiraLink', width: 30 },
      { header: 'Author', key: 'author', width: 25 },
    ]

    // Style header row
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    }

    // Add data rows
    for (const commit of commits) {
      // Format changed files list (newline separated from changedPaths)
      const changedFilesList = commit.changedPaths || ''

      worksheet.addRow({
        dateTime: format(commit.commitDate, 'yyyy-MM-dd HH:mm:ss'),
        repository: commit.repository.name,
        summary: commit.summary || 'Pending analysis...',
        commitName: commit.messageTitle,
        commitDesc: commit.message,
        commitCode: commit.sha.substring(0, 8), // Short SHA as reference code
        changedFiles: changedFilesList,
        filesCount: commit.filesChanged,
        jiraLink: commit.jiraUrl || '',
        author: `${commit.authorName} <${commit.authorEmail}>`,
      })
    }

    // Auto-fit rows and enable text wrap
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.alignment = { vertical: 'top', wrapText: true }
      }
    })

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer()
    const fileName = `git-summary-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.xlsx`

    // Record the export
    await prisma.exportJob.create({
      data: {
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        authorEmail: data.authorEmail,
        repoIds: data.repoIds ? JSON.stringify(data.repoIds) : undefined,
        status: 'COMPLETED',
        fileName,
        fileSize: buffer.byteLength,
        rowCount: commits.length,
        completedAt: new Date(),
      },
    })

    // Return the Excel file directly
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    console.error('Failed to create export:', error)
    return NextResponse.json({ error: 'Failed to create export' }, { status: 500 })
  }
}

// GET - List previous exports
export async function GET() {
  const exports = await prisma.exportJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return NextResponse.json(exports)
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { uploadToS3, getExportKey, getSignedDownloadUrl } from '@/lib/s3'
import { z } from 'zod'
import ExcelJS from 'exceljs'
import { format } from 'date-fns'

const exportSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  authorEmail: z.string().optional(),
  repoIds: z.array(z.string()).optional(),
})

// POST - Create export job
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = exportSchema.parse(body)

    // Create export job
    const exportJob = await prisma.exportJob.create({
      data: {
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        authorEmail: data.authorEmail,
        repoIds: data.repoIds ? JSON.stringify(data.repoIds) : undefined,
        status: 'PROCESSING',
      },
    })

    // Generate Excel file
    try {
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
          changedFiles: true,
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

      // Define columns
      worksheet.columns = [
        { header: 'Date/Time', key: 'dateTime', width: 20 },
        { header: 'Repository', key: 'repository', width: 25 },
        { header: 'Summary of Change', key: 'summary', width: 60 },
        { header: 'Commit Name', key: 'commitName', width: 40 },
        { header: 'Commit Description', key: 'commitDesc', width: 50 },
        { header: 'Code Change Summary', key: 'codeChange', width: 40 },
        { header: 'Files Changed', key: 'filesChanged', width: 15 },
        { header: 'Additions', key: 'additions', width: 12 },
        { header: 'Deletions', key: 'deletions', width: 12 },
        { header: 'Code Zip Link', key: 'zipLink', width: 30 },
        { header: 'JIRA Link', key: 'jiraLink', width: 20 },
        { header: 'Author', key: 'author', width: 25 },
        { header: 'SHA', key: 'sha', width: 15 },
      ]

      // Style header row
      worksheet.getRow(1).font = { bold: true }
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      }
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }

      // Add data rows
      for (const commit of commits) {
        const changedFilesList = commit.changedFiles
          .map((f) => `${f.changeType}: ${f.filePath}`)
          .slice(0, 10)
          .join('\n')

        // Generate zip URL if available
        let zipUrl = ''
        if (commit.zipFileKey) {
          try {
            zipUrl = await getSignedDownloadUrl(commit.zipFileKey, 86400 * 7) // 7 days
          } catch {
            zipUrl = 'Error generating URL'
          }
        }

        worksheet.addRow({
          dateTime: format(commit.commitDate, 'yyyy-MM-dd HH:mm:ss'),
          repository: commit.repository.name,
          summary: commit.summary || 'Pending analysis...',
          commitName: commit.messageTitle,
          commitDesc: commit.message,
          codeChange: `${commit.filesChanged} files: +${commit.insertions}/-${commit.deletions}\n${changedFilesList}`,
          filesChanged: commit.filesChanged,
          additions: commit.insertions,
          deletions: commit.deletions,
          zipLink: zipUrl,
          jiraLink: commit.jiraUrl || '',
          author: `${commit.authorName} <${commit.authorEmail}>`,
          sha: commit.sha.substring(0, 8),
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

      // Upload to S3
      const fileName = `git-summary-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.xlsx`
      const fileKey = getExportKey(exportJob.id)
      await uploadToS3(
        fileKey,
        buffer as Buffer,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )

      // Update export job
      await prisma.exportJob.update({
        where: { id: exportJob.id },
        data: {
          status: 'COMPLETED',
          fileName,
          fileKey,
          fileSize: buffer.byteLength,
          rowCount: commits.length,
          completedAt: new Date(),
        },
      })

      const downloadUrl = await getSignedDownloadUrl(fileKey)

      return NextResponse.json({
        exportId: exportJob.id,
        status: 'COMPLETED',
        fileName,
        rowCount: commits.length,
        downloadUrl,
      })
    } catch (err) {
      console.error('Export generation failed:', err)
      await prisma.exportJob.update({
        where: { id: exportJob.id },
        data: {
          status: 'FAILED',
          error: err instanceof Error ? err.message : 'Unknown error',
        },
      })
      throw err
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    console.error('Failed to create export:', error)
    return NextResponse.json({ error: 'Failed to create export' }, { status: 500 })
  }
}

// GET - List exports or get specific export
export async function GET(request: NextRequest) {
  const exportId = request.nextUrl.searchParams.get('id')

  if (exportId) {
    const exportJob = await prisma.exportJob.findUnique({
      where: { id: exportId },
    })

    if (!exportJob) {
      return NextResponse.json({ error: 'Export not found' }, { status: 404 })
    }

    let downloadUrl = null
    if (exportJob.fileKey && exportJob.status === 'COMPLETED') {
      downloadUrl = await getSignedDownloadUrl(exportJob.fileKey)
    }

    return NextResponse.json({ ...exportJob, downloadUrl })
  }

  // List all exports
  const exports = await prisma.exportJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return NextResponse.json(exports)
}

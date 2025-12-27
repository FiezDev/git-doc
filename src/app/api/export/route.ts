import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import ExcelJS from 'exceljs'
import { format } from 'date-fns'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

const exportSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  authorEmail: z.string().optional(), // single author (legacy)
  authorEmails: z.array(z.string()).optional(), // multiple authors
  repoIds: z.array(z.string()).optional(),
})

// POST - Create export and return Excel file directly
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const data = exportSchema.parse(body)

    // Build query filter
    interface CommitWhereInput {
      authorEmail?: { contains: string } | { in: string[] }
      commitDate?: { gte?: Date; lte?: Date }
      repositoryId?: { in: string[] }
    }
    const where: CommitWhereInput = {}

    // Support multiple authors or single author (legacy)
    if (data.authorEmails && data.authorEmails.length > 0) {
      where.authorEmail = { in: data.authorEmails }
    } else if (data.authorEmail) {
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
      orderBy: { commitDate: 'asc' }, // Oldest first for file history
    })

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Git Work Summarizer'
    workbook.created = new Date()

    // ========== Sheet 1: File Summary (changes by file) ==========
    const fileSummarySheet = workbook.addWorksheet('File Summary', {
      views: [{ state: 'frozen', ySplit: 1 }],
    })

    fileSummarySheet.columns = [
      { header: 'File', key: 'file', width: 50 },
      { header: 'Change History', key: 'changes', width: 80 },
    ]

    // Style header row
    fileSummarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    fileSummarySheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2E7D32' }, // Green header
    }

    // Build file history: Map<filePath, Array<{date, changes}>>
    const fileHistory = new Map<string, Array<{ date: string; changes: string[] }>>()

    // Helper to check if commit is a merge commit
    const isMergeCommit = (message: string) => {
      const lowerMsg = message.toLowerCase()
      return lowerMsg.startsWith('merge commit') ||
             lowerMsg.startsWith('merge pull request') ||
             lowerMsg.startsWith('merge branch') ||
             lowerMsg.startsWith("merge remote-tracking")
    }

    // Helper to clean commit message
    const cleanMessage = (message: string) => {
      return message
        .replace(/Ayay sir/gi, '')  // Remove "Ayay sir" text
        .replace(/\n+/g, ' ')       // Replace newlines with spaces
        .replace(/\s+/g, ' ')       // Collapse multiple spaces
        .trim()
    }

    for (const commit of commits) {
      if (!commit.changedPaths) continue
      
      // Skip merge commits in file summary
      const rawMessage = commit.message || commit.messageTitle || ''
      if (isMergeCommit(rawMessage)) continue
      
      // Use full message, cleaned up
      const changeDesc = cleanMessage(rawMessage)
      if (!changeDesc) continue  // Skip if message is empty after cleaning
      
      const files = commit.changedPaths.split('\n').filter(Boolean)
      const commitDate = format(commit.commitDate, 'dd/MM/yyyy')

      for (const filePath of files) {
        if (!fileHistory.has(filePath)) {
          fileHistory.set(filePath, [])
        }
        
        const history = fileHistory.get(filePath)!
        // Find or create date entry
        let dateEntry = history.find(h => h.date === commitDate)
        if (!dateEntry) {
          dateEntry = { date: commitDate, changes: [] }
          history.push(dateEntry)
        }
        dateEntry.changes.push(`- ${changeDesc}`)
      }
    }

    // Sort files alphabetically and add to sheet
    const sortedFiles = Array.from(fileHistory.entries()).sort((a, b) => 
      a[0].localeCompare(b[0])
    )

    for (const [filePath, history] of sortedFiles) {
      // Sort history by date (newest first for display)
      const sortedHistory = [...history].sort((a, b) => {
        const [dayA, monthA, yearA] = a.date.split('/').map(Number)
        const [dayB, monthB, yearB] = b.date.split('/').map(Number)
        const dateA = new Date(yearA, monthA - 1, dayA)
        const dateB = new Date(yearB, monthB - 1, dayB)
        return dateB.getTime() - dateA.getTime()
      })

      // Format change history as multi-line text
      const changeText = sortedHistory.map(h => 
        `${h.date}\n${h.changes.join('\n')}`
      ).join('\n\n')

      fileSummarySheet.addRow({
        file: filePath,
        changes: changeText,
      })
    }

    // Style file summary rows
    fileSummarySheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.alignment = { vertical: 'top', wrapText: true }
        // Calculate row height based on content
        const changesCell = row.getCell('changes')
        const lineCount = String(changesCell.value || '').split('\n').length
        row.height = Math.max(20, lineCount * 15)
      }
    })

    // ========== Sheet 2: Git Commits (raw data) ==========
    const commitsSheet = workbook.addWorksheet('Git Commits', {
      views: [{ state: 'frozen', ySplit: 1 }],
    })

    commitsSheet.columns = [
      { header: 'Date Time', key: 'dateTime', width: 20 },
      { header: 'Repository', key: 'repository', width: 25 },
      { header: 'Commit Name', key: 'commitName', width: 50 },
      { header: 'Commit Description', key: 'commitDesc', width: 60 },
      { header: 'Commit Code', key: 'commitCode', width: 12 },
      { header: 'Changed Files', key: 'changedFiles', width: 50 },
      { header: 'Files Count', key: 'filesCount', width: 12 },
      { header: 'JIRA Link', key: 'jiraLink', width: 30 },
      { header: 'Author', key: 'author', width: 30 },
    ]

    // Style header row
    commitsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    commitsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    }

    // Add commit rows (newest first for this sheet)
    const sortedCommits = [...commits].reverse()
    for (const commit of sortedCommits) {
      commitsSheet.addRow({
        dateTime: format(commit.commitDate, 'yyyy-MM-dd HH:mm:ss'),
        repository: commit.repository.name,
        commitName: commit.messageTitle,
        commitDesc: commit.message,
        commitCode: commit.sha.substring(0, 8),
        changedFiles: commit.changedPaths || '',
        filesCount: commit.filesChanged,
        jiraLink: commit.jiraUrl || '',
        author: `${commit.authorName} <${commit.authorEmail}>`,
      })
    }

    commitsSheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        row.alignment = { vertical: 'top', wrapText: true }
      }
    })

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer()
    const fileName = `git-summary-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.xlsx`

    // Save file to exports folder in root
    const exportsDir = path.join(process.cwd(), 'exports')
    await mkdir(exportsDir, { recursive: true })
    const filePath = path.join(exportsDir, fileName)
    await writeFile(filePath, Buffer.from(buffer))
    console.log(`Export saved to: ${filePath}`)

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

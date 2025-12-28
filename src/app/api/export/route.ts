import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import ExcelJS from 'exceljs'
import JSZip from 'jszip' // Keep for potential future use but not used currently
import { format } from 'date-fns'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { generateProgressReport } from '@/lib/ai'

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

    // Helpers
    const sanitizeSheetName = (name: string) => name.replace(/[\\/:?*\[\]]/g, '').slice(0, 31)
    const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'repo'

    // Group commits by repository
    const commitsByRepo = new Map<string, { repoName: string; repoUrl: string; commits: typeof commits }>()
    for (const commit of commits) {
      const entry = commitsByRepo.get(commit.repositoryId) || {
        repoName: commit.repository.name,
        repoUrl: commit.repository.url,
        commits: [],
      }
      entry.commits.push(commit)
      commitsByRepo.set(commit.repositoryId, entry)
    }

    // Helper to check if commit is a merge commit
    const isMergeCommit = (message: string) => {
      const lowerMsg = message.toLowerCase()
      return lowerMsg.startsWith('merge commit') ||
             lowerMsg.startsWith('merge pull request') ||
             lowerMsg.startsWith('merge branch') ||
             lowerMsg.startsWith('merge remote-tracking')
    }

    // Helper to clean commit message
    const cleanMessage = (message: string) => {
      return message
        .replace(/Ayay sir/gi, '')
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }

    // For each repository, create its own workbook and save file
    const repoEntries = Array.from(commitsByRepo.entries()).sort((a, b) => a[1].repoName.localeCompare(b[1].repoName))
    const exportsDir = path.join(process.cwd(), 'exports')
    await mkdir(exportsDir, { recursive: true })
    const timestamp = format(new Date(), 'yyyy-MM-dd-HHmmss')
    const generatedFiles: Array<{ fileName: string; buffer: Buffer }> = []

    for (const [, repoData] of repoEntries) {
      const repoCommits = repoData.commits
      if (repoCommits.length === 0) continue

      // New workbook per repo
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'Git Work Summarizer'
      workbook.created = new Date()

      // Sort asc for date calculations
      repoCommits.sort((a, b) => a.commitDate.getTime() - b.commitDate.getTime())

      const authorNames = [...new Set(repoCommits.map(c => c.authorName))]
      const commitMessages = repoCommits.map(c => c.message || c.messageTitle || '').filter(Boolean)
      const totalFilesChanged = repoCommits.reduce((sum, c) => sum + (c.filesChanged || 0), 0)
      const dateRange = {
        start: data.startDate ? format(new Date(data.startDate), 'MMMM d, yyyy') : format(repoCommits[0].commitDate, 'MMMM d, yyyy'),
        end: data.endDate ? format(new Date(data.endDate), 'MMMM d, yyyy') : format(repoCommits[repoCommits.length - 1].commitDate, 'MMMM d, yyyy'),
      }

      // Summary sheet for this repo
      const summarySheet = workbook.addWorksheet(sanitizeSheetName(`${repoData.repoName} - Summary`))
      summarySheet.columns = [{ key: 'content', width: 100 }]

      const titleRow = summarySheet.addRow({ content: `${repoData.repoName} - Development Progress Report` })
      titleRow.font = { bold: true, size: 16, color: { argb: 'FF1565C0' } }
      titleRow.height = 26

      const dateRow = summarySheet.addRow({ content: `${dateRange.start} - ${dateRange.end}` })
      dateRow.font = { size: 12, italic: true, color: { argb: 'FF666666' } }

      summarySheet.addRow({ content: '' })

      const statsRow = summarySheet.addRow({
        content: `Authors: ${authorNames.join(', ')}  |  Commits: ${repoCommits.length}  |  Files Changed: ${totalFilesChanged}`,
      })
      statsRow.font = { size: 10, color: { argb: 'FF888888' } }

      summarySheet.addRow({ content: '' })
      const separatorRow = summarySheet.addRow({ content: '─'.repeat(80) })
      separatorRow.font = { color: { argb: 'FFCCCCCC' } }
      summarySheet.addRow({ content: '' })

      const progressReport = await generateProgressReport({
        authorNames,
        dateRange,
        repositories: [repoData.repoName],
        commitMessages,
        totalCommits: repoCommits.length,
        totalFilesChanged,
      })

      const paragraphs = progressReport.split(/\n\n+/)
      for (const paragraph of paragraphs) {
        if (paragraph.trim()) {
          const row = summarySheet.addRow({ content: paragraph.trim() })
          row.alignment = { wrapText: true, vertical: 'top' }
          const lineCount = Math.ceil(paragraph.length / 90) + paragraph.split('\n').length
          row.height = Math.max(20, lineCount * 15)
        }
      }

      summarySheet.eachRow((row) => {
        row.alignment = { ...row.alignment, wrapText: true }
      })

      // File Summary sheet for this repo
      const fileSummarySheet = workbook.addWorksheet(sanitizeSheetName(`${repoData.repoName} - File Summary`), {
        views: [{ state: 'frozen', ySplit: 1 }],
      })

      fileSummarySheet.columns = [
        { header: 'File', key: 'file', width: 50 },
        { header: 'Change History', key: 'changes', width: 80 },
      ]

      fileSummarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      fileSummarySheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2E7D32' },
      }

      const fileHistory = new Map<string, Array<{ date: string; changes: string[] }>>()

      for (const commit of repoCommits) {
        if (!commit.changedPaths) continue

        const rawMessage = commit.message || commit.messageTitle || ''
        if (isMergeCommit(rawMessage)) continue

        const changeDesc = cleanMessage(rawMessage)
        if (!changeDesc) continue

        const files = commit.changedPaths.split('\n').filter(Boolean)
        const commitDate = format(commit.commitDate, 'dd/MM/yyyy')

        for (const filePath of files) {
          if (!fileHistory.has(filePath)) {
            fileHistory.set(filePath, [])
          }

          const history = fileHistory.get(filePath)!
          let dateEntry = history.find(h => h.date === commitDate)
          if (!dateEntry) {
            dateEntry = { date: commitDate, changes: [] }
            history.push(dateEntry)
          }
          dateEntry.changes.push(`- ${changeDesc}`)
        }
      }

      const sortedFiles = Array.from(fileHistory.entries()).sort((a, b) => a[0].localeCompare(b[0]))

      for (const [filePath, history] of sortedFiles) {
        const sortedHistory = [...history].sort((a, b) => {
          const [dayA, monthA, yearA] = a.date.split('/').map(Number)
          const [dayB, monthB, yearB] = b.date.split('/').map(Number)
          const dateA = new Date(yearA, monthA - 1, dayA)
          const dateB = new Date(yearB, monthB - 1, dayB)
          return dateB.getTime() - dateA.getTime()
        })

        const changeText = sortedHistory.map(h => `${h.date}\n${h.changes.join('\n')}`).join('\n\n')

        fileSummarySheet.addRow({
          file: filePath,
          changes: changeText,
        })
      }

      fileSummarySheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.alignment = { vertical: 'top', wrapText: true }
          const changesCell = row.getCell('changes')
          const lineCount = String(changesCell.value || '').split('\n').length
          row.height = Math.max(20, lineCount * 15)
        }
      })

      // Git Commits sheet for this repo
      const commitsSheet = workbook.addWorksheet(sanitizeSheetName(`${repoData.repoName} - Git Commits`), {
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

      commitsSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      commitsSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      }

      const sortedCommits = [...repoCommits].reverse()
      for (const commit of sortedCommits) {
        commitsSheet.addRow({
          dateTime: format(commit.commitDate, 'yyyy-MM-dd HH:mm:ss'),
          repository: repoData.repoName,
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

      // Write file for this repo
      const fileName = `${slugify(repoData.repoName)}-git-summary-${timestamp}.xlsx`
      const buffer = await workbook.xlsx.writeBuffer()
      const filePath = path.join(exportsDir, fileName)
      await writeFile(filePath, Buffer.from(buffer))
      console.log(`Export saved to: ${filePath}`)
      generatedFiles.push({ fileName, filePath, fileSize: buffer.byteLength })
    }

    if (generatedFiles.length === 0) {
      return NextResponse.json({ error: 'No commits found for selected repositories' }, { status: 400 })
    }

    // Record the export
    const exportJob = await prisma.exportJob.create({
      data: {
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        authorEmail: data.authorEmail,
        repoIds: data.repoIds ? JSON.stringify(data.repoIds) : undefined,
        status: 'COMPLETED',
        fileName: generatedFiles.map(f => f.fileName).join(', '),
        fileSize: generatedFiles.reduce((sum, f) => sum + f.fileSize, 0),
        rowCount: commits.length,
        completedAt: new Date(),
      },
    })

    // Return JSON with file info instead of blob
    return NextResponse.json({
      success: true,
      exportId: exportJob.id,
      files: generatedFiles.map(f => ({
        fileName: f.fileName,
        filePath: f.filePath,
        fileSize: f.fileSize,
      })),
      totalCommits: commits.length,
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

// Google Gemini AI for commit summaries
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

export interface CommitSummaryInput {
  commitMessage: string
  changedPaths: string // newline-separated list of file paths
  filesChanged: number
}

export async function summarizeCommit(input: CommitSummaryInput): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.warn('GEMINI_API_KEY not set, skipping AI summary')
    return 'AI summary not available'
  }

  const fileList = input.changedPaths.split('\n').filter(Boolean)
  const filesPreview = fileList.slice(0, 15).join('\n')
  const moreFiles = fileList.length > 15 ? `\n... and ${fileList.length - 15} more files` : ''

  const prompt = `Summarize this git commit in a clear, human-readable way that both technical and non-technical people can understand.

Commit Message: ${input.commitMessage}

Files Changed (${input.filesChanged} files):
${filesPreview}${moreFiles}

Provide a concise summary (2-3 sentences) that explains:
1. What was changed
2. Why it might have been changed (if apparent from the commit message or file names)
3. The impact or scope of the change

Keep it simple and avoid technical jargon where possible. Reply in plain text only.`

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 300,
          temperature: 0.3,
        },
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      // Check if rate limited
      if (response.status === 429 || error.includes('RESOURCE_EXHAUSTED')) {
        console.warn('Gemini API rate limited, will retry later')
        return 'Rate limited - please retry later'
      }
      console.error('Gemini API error:', error)
      return 'Unable to generate summary'
    }

    const data = await response.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Unable to generate summary'
  } catch (error) {
    console.error('Failed to call Gemini API:', error)
    return 'Unable to generate summary'
  }
}

export async function batchSummarizeCommits(
  commits: CommitSummaryInput[]
): Promise<string[]> {
  // Process in batches of 5 to avoid rate limits
  const batchSize = 5
  const results: string[] = []

  for (let i = 0; i < commits.length; i += batchSize) {
    const batch = commits.slice(i, i + batchSize)
    const summaries = await Promise.all(batch.map((commit) => summarizeCommit(commit)))
    results.push(...summaries)

    // Small delay between batches to avoid rate limits
    if (i + batchSize < commits.length) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  return results
}

export interface ProgressReportInput {
  authorNames: string[]
  dateRange: { start: string; end: string }
  repositories: string[]
  commitMessages: string[]
  totalCommits: number
  totalFilesChanged: number
}

// Local fallback summary when AI is unavailable or rate limited
const buildLocalSummary = (input: ProgressReportInput, reason: string): string => {
  const authors = input.authorNames.length ? input.authorNames.join(', ') : 'Unknown'
  const repos = input.repositories.length ? input.repositories.join(', ') : 'N/A'
  const sampleMessages = [...new Set(input.commitMessages)]
    .filter((msg) => !!msg)
    .filter((msg) => !msg.toLowerCase().startsWith('merge '))
    .slice(0, 8)
    .map((msg) => `- ${msg.slice(0, 180)}${msg.length > 180 ? '...' : ''}`)
    .join('\n') || '- No commit samples available'

  return `Development Progress Report
${input.dateRange.start} - ${input.dateRange.end}

Overview:
- Authors: ${authors}
- Repositories: ${repos}
- Total commits: ${input.totalCommits}
- Files changed: ${input.totalFilesChanged}

Highlights (sample commits):
${sampleMessages}

Notes:
- AI summary unavailable (${reason}). This is a local fallback summary.`
}

export async function generateProgressReport(input: ProgressReportInput): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.warn('GEMINI_API_KEY not set, skipping AI summary')
    return buildLocalSummary(input, 'GEMINI_API_KEY not configured')
  }

  // Group commit messages and limit to avoid token overflow
  const uniqueMessages = [...new Set(input.commitMessages)]
    .filter((msg) => !!msg)
    .filter((msg) => !msg.toLowerCase().startsWith('merge '))
    .map((msg) => msg.slice(0, 200)) // cap individual length
    .slice(0, 40) // keep prompt compact to reduce rate-limit risk

  const prompt = `You are writing a professional Development Progress Report summary.

Report Period: ${input.dateRange.start} to ${input.dateRange.end}
Author(s): ${input.authorNames.join(', ')}
Repositories: ${input.repositories.join(', ')}
Total Commits: ${input.totalCommits}
Total Files Changed: ${input.totalFilesChanged}

Commit Messages (sample):
${uniqueMessages.map(m => `- ${m}`).join('\n')}

Write a professional, well-structured progress report summary in the following format:

**Development Progress Report**
[Date Range]

Start with a brief opening statement about the period and overall accomplishments.

Then organize the work into logical categories/areas (identify these from the commit messages). For each area:
- Use clear section headers
- Describe what was accomplished in readable prose
- Highlight key features, improvements, or fixes
- Keep technical terms but explain their business value

End with a brief summary of the overall impact.

Guidelines:
- Write in third person professional tone
- Be concise but comprehensive
- Group related work together logically
- Make it readable for both technical and non-technical audiences
- Use proper paragraph breaks for readability
- Do NOT use markdown formatting (no **, ##, etc.) - use plain text only
- Separate sections with blank lines`

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 800, // keep shorter to reduce quota and latency
          temperature: 0.3,
        },
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      if (response.status === 429 || error.includes('RESOURCE_EXHAUSTED')) {
        console.warn('Gemini API rate limited')
        return buildLocalSummary(input, 'Gemini API rate limited')
      }
      console.error('Gemini API error:', error)
      return buildLocalSummary(input, 'Gemini API error')
    }

    const data = await response.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || buildLocalSummary(input, 'Empty AI response')
  } catch (error) {
    console.error('Failed to generate progress report:', error)
    return buildLocalSummary(input, 'Request failed')
  }
}

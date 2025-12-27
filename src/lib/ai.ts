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

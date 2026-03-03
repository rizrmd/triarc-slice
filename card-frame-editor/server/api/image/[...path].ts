import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { sendStream } from 'h3'
import { createReadStream } from 'node:fs'

export default defineEventHandler(async (event) => {
  const path = event.context.params?.path
  if (!path) {
    throw createError({ statusCode: 400, statusMessage: 'Path required' })
  }

  const rootDir = process.cwd()
  // path will be something like "characters/foo.png" or "actions/bar.png"
  const decodedPath = decodeURIComponent(path)
  const filePath = resolve(rootDir, '..', decodedPath)

  try {
    // Basic security check: ensure we are not going outside the project root
    if (!filePath.startsWith(resolve(rootDir, '..'))) {
      throw createError({ statusCode: 403, statusMessage: 'Access denied' })
    }

    const stream = createReadStream(filePath)
    return sendStream(event, stream)
  } catch (e) {
    throw createError({ statusCode: 404, statusMessage: 'File not found' })
  }
})

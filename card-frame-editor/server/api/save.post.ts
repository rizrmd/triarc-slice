import { writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  
  if (!body || !body.name) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid card data' })
  }

  const rootDir = process.cwd()
  // Adjust path: card-frame-editor is the root of the Nuxt app
  // cards/hero/ is the target directory
  const cardsDir = resolve(rootDir, '../cards/hero')
  
  // Ensure directory exists
  await mkdir(cardsDir, { recursive: true })
  
  // Sanitize filename
  const filename = body.name.replace(/[^a-z0-9]/gi, '-').toLowerCase() + '.json'
  const filePath = resolve(cardsDir, filename)

  try {
    await writeFile(filePath, JSON.stringify(body, null, 2))
    return { success: true, path: filePath }
  } catch (e) {
    console.error('Failed to save card', e)
    throw createError({ statusCode: 500, statusMessage: 'Failed to save card' })
  }
})

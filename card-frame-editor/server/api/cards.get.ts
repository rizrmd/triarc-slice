import { readdir, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

export default defineEventHandler(async (event) => {
  const rootDir = process.cwd()
  const cardsDir = resolve(rootDir, '../cards/hero')
  
  const cards: { name: string, path: string, data: any }[] = []

  try {
    const files = await readdir(cardsDir)
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const filePath = join(cardsDir, file)
          const content = await readFile(filePath, 'utf-8')
          const data = JSON.parse(content)
          
          cards.push({
            name: data.name || file.replace('.json', ''),
            path: filePath, // This is server path, maybe we need an ID or just data
            data: data
          })
        } catch (e) {
          console.warn(`Failed to parse card file ${file}`, e)
        }
      }
    }
  } catch (e) {
    // Directory might not exist yet, which is fine
    // console.warn('Cards dir not found or empty', e)
  }

  return cards
})

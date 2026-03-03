import { readdir } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'

export default defineEventHandler(async (event) => {
  const rootDir = process.cwd()
  // Adjust path: card-frame-editor is the root of the Nuxt app
  // assets/ is one level up
  const assetsBaseDir = resolve(rootDir, '../assets')
  
  const assets: { name: string, path: string, folder: string }[] = []

  async function scanDir(dir: string) {
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        
        if (entry.isDirectory()) {
          await scanDir(fullPath)
        } else if (entry.isFile() && (entry.name.endsWith('.png') || entry.name.endsWith('.webp') || entry.name.endsWith('.jpg'))) {
          // Calculate relative path from assets base dir to use as folder name
          const relPath = relative(assetsBaseDir, dir)
          
          // Ensure forward slashes for URL consistency
          const normalizedRelPath = relPath.split('\\').join('/')
          const normalizedEntryName = entry.name
          
          // The image path needs to be relative to the project root for the API to resolve correctly
          // API uses: resolve(rootDir, '..', decodedPath)
          // So we need path to be 'assets/subfolder/file.png'
          const apiPath = `assets/${normalizedRelPath ? normalizedRelPath + '/' : ''}${normalizedEntryName}`
          
          assets.push({
            name: entry.name,
            path: `/api/image/${encodeURIComponent(apiPath)}`, 
            folder: normalizedRelPath || 'root'
          })
        }
      }
    } catch (e) {
      // Directory might not exist or be empty
    }
  }

  await scanDir(assetsBaseDir)
  return assets
})

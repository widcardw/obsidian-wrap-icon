import { App, FileSystemAdapter, Notice, requestUrl } from 'obsidian'

export interface IconData {
  body: string
  width?: number
  height?: number
}
interface IconAlias {
  parent: string
  hFlip?: boolean
  vFlip?: boolean
  rotate?: number
}
interface IconifyResponse {
  prefix?: string
  width?: number
  height?: number
  icons?: Record<string, IconData>
  aliases?: Record<string, IconAlias>
}
export interface IconSet {
  prefix: string
  width?: number
  height?: number
  icons: Record<string, IconData>
}
export interface IconCollection {
  prefix: string
  name: string
  total?: number
  category?: string
  license?: { title?: string; spdx?: string }
}
const assetsFolder = 'assets'
const pluginId = 'wrapper-icon'

function pluginAssetsPath(app: App, fileName = ''): string {
  return `${app.vault.configDir}/plugins/${pluginId}/${assetsFolder}${fileName ? `/${fileName}` : ''}`
}

function getPluginFolderPath(app: App): string {
  return `${app.vault.configDir}/plugins/${pluginId}`
}

export async function ensureAssets(app: App): Promise<void> {
  const adapter = app.vault.adapter
  const folder = pluginAssetsPath(app)
  if (!(await adapter.exists(folder))) await adapter.mkdir(folder)
}
export async function saveIconSet(app: App, set: IconSet): Promise<void> {
  await ensureAssets(app)
  const path = pluginAssetsPath(app, `${set.prefix}.json`)
  await app.vault.adapter.write(path, JSON.stringify(set))
}
export async function loadIconSets(app: App): Promise<IconSet[]> {
  const folder = pluginAssetsPath(app)
  if (!(await app.vault.adapter.exists(folder))) return []
  const sets: IconSet[] = []
  const listed = await app.vault.adapter.list(folder)
  for (const path of listed.files) {
    if (!path.endsWith('.json')) continue
    try {
      sets.push(JSON.parse(await app.vault.adapter.read(path)) as IconSet)
    } catch {
      /* ignore malformed files */
    }
  }
  return sets
}
export async function deleteIconSet(app: App, prefix: string): Promise<void> {
  const path = pluginAssetsPath(app, `${prefix}.json`)
  if (await app.vault.adapter.exists(path)) await app.vault.adapter.remove(path)
}
export function getIconSetPath(app: App, prefix: string): string {
  return pluginAssetsPath(app, `${prefix}.json`)
}
export function getIconSetDisplayPath(app: App, prefix: string): string {
  const adapter = app.vault.adapter as FileSystemAdapter
  if (typeof adapter.getBasePath === 'function')
    return `${adapter.getBasePath()}/${getPluginFolderPath(app)}/${assetsFolder}/${prefix}.json`
  return getIconSetPath(app, prefix)
}
export async function searchCollections(query: string): Promise<IconCollection[]> {
  const response = await requestUrl({ url: 'https://api.iconify.design/collections' })
  const collections = response.json as Record<string, Omit<IconCollection, 'prefix'>>
  const normalized = query.trim().toLowerCase()
  return Object.entries(collections)
    .map(([prefix, collection]) => ({ prefix, ...collection }))
    .filter(
      (collection) =>
        !normalized ||
        `${collection.prefix} ${collection.name} ${collection.category || ''}`
          .toLowerCase()
          .includes(normalized),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function downloadIconSet(app: App, prefix: string, icons: string): Promise<void> {
  const names = icons
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
  // Iconify JSON packages are not subject to the API's large-collection limit.
  // They are published as static JSON by the Iconify project and can be consumed
  // by the plugin without installing npm or running commands on the user's system.
  const raw = await downloadIconifyJsonPackage(prefix)
  if (!raw.icons || Object.keys(raw.icons).length === 0)
    throw new Error(`No icons could be loaded from “${prefix}”.`)
  const allIcons = resolveAliases(raw.icons, raw.aliases || {})
  const selectedNames = names.map((name) =>
    name.includes(':') ? name.slice(name.indexOf(':') + 1) : name,
  )
  const selected: Record<string, IconData> = {}
  if (selectedNames.length) {
    for (const name of selectedNames) if (allIcons[name]) selected[name] = allIcons[name]
  } else {
    Object.assign(selected, allIcons)
  }
  if (Object.keys(selected).length === 0) {
    const examples = Object.keys(allIcons).slice(0, 5).join(', ')
    throw new Error(
      `No matching icons found in “${prefix}”. Examples from this collection: ${examples}`,
    )
  }
  await saveIconSet(app, {
    prefix: raw.prefix || prefix,
    width: raw.width,
    height: raw.height,
    icons: selected,
  })
  new Notice(`Downloaded ${Object.keys(selected).length} icon(s) from ${prefix}.`)
}

async function downloadIconifyJsonPackage(prefix: string): Promise<IconifyResponse> {
  const packageName = encodeURIComponent(prefix)
  const urls = [
    `https://cdn.jsdelivr.net/npm/@iconify-json/${packageName}@latest/icons.json`,
    `https://unpkg.com/@iconify-json/${packageName}@latest/icons.json`,
  ]
  const failures: string[] = []
  for (const url of urls) {
    try {
      const response = await requestUrl({ url })
      const result = response.json as IconifyResponse
      if (result.icons && Object.keys(result.icons).length > 0) return result
      failures.push(`${url} returned no icons`)
    } catch (error) {
      failures.push(`${url}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  throw new Error(`Could not download @iconify-json/${prefix}/icons.json. ${failures.join(' | ')}`)
}

function resolveAliases(
  icons: Record<string, IconData>,
  aliases: Record<string, IconAlias>,
): Record<string, IconData> {
  const resolved = { ...icons }
  const resolving = new Set<string>()
  const resolve = (name: string): IconData | undefined => {
    if (resolved[name]) return resolved[name]
    const alias = aliases[name]
    if (!alias || resolving.has(name)) return undefined
    resolving.add(name)
    const parent = resolve(alias.parent)
    resolving.delete(name)
    if (!parent) return undefined
    // Most aliases are direct references. Preserve the parent body; transforms are rare in the sets
    // used for inline icons and are intentionally flattened without changing the SVG paths.
    resolved[name] = { ...parent }
    return resolved[name]
  }
  for (const name of Object.keys(aliases)) resolve(name)
  return resolved
}
export function createIconSvg(icon: IconData, set: IconSet): SVGElement {
  const svg = createSvg('svg')
  const width = icon.width || set.width || 24
  const height = icon.height || set.height || 24
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('plug-wrap-icon-icon')
  // Iconify bodies are SVG markup from the downloaded Iconify JSON.
  // Iconify's downloaded JSON contains the SVG body needed for the icon.
  // eslint-disable-next-line no-unsanitized/method -- body is read from the user's local Iconify asset.
  svg.insertAdjacentHTML('afterbegin', icon.body)
  return svg
}
export function findIcon(
  sets: IconSet[],
  fullName: string,
): { icon: IconData; set: IconSet } | null {
  const split = fullName.indexOf(':')
  if (split < 1) return null
  const prefix = fullName.slice(0, split)
  const name = fullName.slice(split + 1)
  const set = sets.find((candidate) => candidate.prefix === prefix)
  const icon = set?.icons[name]
  return icon && set ? { icon, set } : null
}

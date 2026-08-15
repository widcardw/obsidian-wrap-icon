import { FileSystemAdapter, Notice, Plugin } from 'obsidian'
import { DEFAULT_SETTINGS, WrapperIconSettings, WrapperIconSettingTab } from './settings'
import { createIconSvg, findIcon, IconSet, loadIconSets } from './icons'
import { DownloaderModal } from './ui'
import { IconSuggest } from './suggest'
import { createLivePreviewExtension } from './live-preview'

export default class WrapperIconPlugin extends Plugin {
  settings!: WrapperIconSettings
  iconSets: IconSet[] = []
  async onload(): Promise<void> {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      (await this.loadData()) as Partial<WrapperIconSettings>,
    )
    this.iconSets = await loadIconSets(this.app)
    this.addSettingTab(new WrapperIconSettingTab(this.app, this))
    this.registerEditorSuggest(new IconSuggest(this))
    this.registerEditorExtension(createLivePreviewExtension(this))
    this.registerMarkdownPostProcessor((element: HTMLElement) => this.renderInlineIcons(element))
    this.addCommand({
      id: 'reload-local-icon-sets',
      name: 'Reload local icon sets',
      callback: async () => {
        this.iconSets = await loadIconSets(this.app)
      },
    })
    this.addCommand({
      id: 'download-icon-set',
      name: 'Download iconify icon set',
      callback: () => this.openDownloader(),
    })
  }
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
  }
  openDownloader(): void {
    new DownloaderModal(this).open()
  }
  async openStylesheet(): Promise<void> {
    const adapter = this.app.vault.adapter
    if (!(adapter instanceof FileSystemAdapter)) {
      new Notice(
        'The CSS file is stored beside main.js in the plugin folder. Open it on desktop to edit it.',
      )
      return
    }
    const cssPath = `${adapter.getBasePath()}/${this.app.vault.configDir}/plugins/${this.manifest.id}/styles.css`
    try {
      const requireFn = (window as unknown as { require?: (id: string) => unknown }).require
      if (!requireFn) throw new Error('Electron is unavailable')
      const electronModule = requireFn('electron') as {
        shell?: { openPath?: (path: string) => Promise<string> }
      }
      const result = await electronModule.shell?.openPath?.(cssPath)
      if (result) throw new Error(result)
    } catch {
      new Notice(`Could not open styles.css. Path: ${cssPath}`)
    }
  }
  private renderInlineIcons(element: HTMLElement): void {
    for (const code of Array.from(element.querySelectorAll('code'))) {
      const escapedDelimiter = this.settings.delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const match = code.textContent?.match(
        new RegExp(`^\\/ico\\s+([^\\s${escapedDelimiter}\`]+)${escapedDelimiter}(.*)$`, 's'),
      )
      if (!match) continue
      const found = findIcon(this.iconSets, match[1] || '')
      if (!found) continue
      const wrapper = createSpan()
      wrapper.className = 'plug-wrap-icon'
      wrapper.appendChild(createIconSvg(found.icon, found.set))
      const text = createSpan()
      text.className = 'plug-wrap-icon-text'
      text.textContent = match[2] || ''
      wrapper.appendChild(text)
      code.replaceWith(wrapper)
    }
  }
}

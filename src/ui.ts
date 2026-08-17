import { debounce, Modal, Notice, Setting } from 'obsidian'
import type WrapperIconPlugin from './main'
import {
  deleteIconSet,
  downloadIconSet,
  getIconSetDisplayPath,
  getIconSetPath,
  IconCollection,
  loadIconSets,
  searchCollections,
} from './icons'

class IconPathModal extends Modal {
  constructor(
    app: DownloaderModal['app'],
    private readonly path: string,
  ) {
    super(app)
  }
  onOpen(): void {
    const { contentEl } = this
    contentEl.empty()
    new Setting(contentEl).setName('Icon set location').setHeading()
    contentEl.createEl('p', {
      text: this.path,
      cls: 'plug-wrap-icon-path-value',
    })
    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText('Copy path')
          .setCta()
          .onClick(async () => {
            try {
              await navigator.clipboard.writeText(this.path)
              new Notice('Path copied.')
            } catch {
              new Notice('Could not copy the path.')
            }
          }),
      )
      .addButton((button) =>
        button.setButtonText('Close').onClick(() => this.close()),
      )
  }
}

export class DownloaderModal extends Modal {
  private query = ''
  private icons = ''
  private selected: IconCollection | null = null
  private resultsEl!: HTMLElement
  private statusEl!: HTMLElement
  private offlineEl!: HTMLElement
  private offlineStatusEl!: HTMLElement
  private manualPrefix = ''
  private readonly debouncedSearch = debounce(
    () => {
      void this.refreshResults()
    },
    300,
    true,
  )

  constructor(private readonly plugin: WrapperIconPlugin) {
    super(plugin.app)
  }
  onOpen(): void {
    const { contentEl } = this
    contentEl.empty()
    new Setting(contentEl).setName('Download iconify icons').setHeading()
    contentEl.createEl('p', {
      text: 'Search by collection name or prefix, then select a result. Collections are downloaded from @iconify-json.',
    })
    const local = contentEl.createDiv({ cls: 'plug-wrap-icon-local-sets' })
    local.createEl('strong', { text: 'Downloaded collections' })
    if (!this.plugin.iconSets.length) local.createSpan({ text: ' None yet.' })
    for (const set of this.plugin.iconSets) {
      const row = local.createDiv({ cls: 'plug-wrap-icon-local-set' })
      const pathEl = row.createSpan({
        cls: 'plug-wrap-icon-local-path',
        text: set.prefix,
      })
      row.createSpan({ text: `(${Object.keys(set.icons).length})` })
      pathEl.addEventListener('click', () =>
        new IconPathModal(
          this.plugin.app,
          getIconSetDisplayPath(this.plugin, set.prefix),
        ).open(),
      )
      row
        .createEl('button', { text: 'Delete' })
        .addEventListener('click', () => {
          void (async () => {
            await deleteIconSet(this.plugin, set.prefix)
            this.plugin.iconSets = await loadIconSets(this.plugin)
            row.remove()
          })()
        })
    }
    new Setting(contentEl).setName('Search collections').addText((text) =>
      text.setPlaceholder('Material design icons').onChange((value) => {
        this.query = value
        this.debouncedSearch()
      }),
    )
    this.statusEl = contentEl.createDiv({
      cls: 'plug-wrap-icon-download-status',
    })
    this.resultsEl = contentEl.createDiv({
      cls: 'plug-wrap-icon-collection-results',
    })
    this.offlineEl = contentEl.createDiv({ cls: 'plug-wrap-icon-offline' })
    this.offlineEl.style.display = 'none'
    this.offlineStatusEl = this.offlineEl.createEl('p', {
      cls: 'plug-wrap-icon-offline-status',
    })
    this.offlineEl.createEl('strong', {
      text: 'Network unavailable',
    })
    this.offlineEl.createEl('p', {
      text: 'Obsidian cannot reach the network, but you can still download icon sets with your browser and load them manually.',
    })
    new Setting(this.offlineEl)
      .setName('Browse icon sets')
      .setDesc('Open the Iconify collection browser in your default browser.')
      .addButton((button) =>
        button
          .setButtonText('Open Iconify')
          .onClick(() => {
            window.open('https://icon-sets.iconify.design/', '_blank')
          }),
      )
    new Setting(this.offlineEl)
      .setName('Icon set ID')
      .setDesc(
        'Paste the collection prefix (e.g. "mdi"), then open its download URL.',
      )
      .addText((text) =>
        text.setPlaceholder('mdi').onChange((value) => {
          this.manualPrefix = value.trim()
        }),
      )
      .addButton((button) =>
        button
          .setButtonText('Open download URL')
          .onClick(() => {
            if (!this.manualPrefix) {
              new Notice('Enter an icon set ID first.')
              return
            }
            const url = `https://cdn.jsdelivr.net/npm/@iconify-json/${encodeURIComponent(this.manualPrefix)}@latest/icons.json`
            window.open(url, '_blank')
          }),
      )
    const offlineHint = this.offlineEl.createEl('p')
    offlineHint.appendText('Save the downloaded file as ')
    offlineHint.createSpan({
      cls: 'plug-wrap-icon-offline-path',
      text: getIconSetPath(this.plugin, '<prefix>'),
    })
    offlineHint.appendText(
      ', then run the "Reload local icon sets" command.',
    )
    new Setting(contentEl)
      .setName('Icon names')
      .setDesc(
        'Optional comma-separated names. Leave empty to download the whole selected collection.',
      )
      .addText((text) =>
        text.setPlaceholder('Home,account').onChange((value) => {
          this.icons = value
        }),
      )
    new Setting(contentEl).addButton((button) =>
      button
        .setButtonText('Download selected collection')
        .setCta()
        .onClick(async () => {
          if (!this.selected) {
            new Notice('Select a collection first.')
            return
          }
          button.setDisabled(true)
          try {
            await downloadIconSet(this.plugin, this.selected.prefix, this.icons)
            this.plugin.iconSets = await loadIconSets(this.plugin)
            this.close()
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error)
            new Notice(message)
            this.showOffline(message)
          } finally {
            button.setDisabled(false)
          }
        }),
    )
    void this.refreshResults()
  }

  private async refreshResults(): Promise<void> {
    if (!this.resultsEl) return
    this.statusEl.setText('Searching iconify collections…')
    this.resultsEl.empty()
    try {
      const results = (await searchCollections(this.query)).slice(0, 30)
      this.statusEl.setText(`${results.length} collection(s) found`)
      this.hideOffline()
      for (const collection of results) {
        const row = this.resultsEl.createDiv({
          cls: 'plug-wrap-icon-collection-row',
        })
        row.createEl('strong', { text: collection.name })
        row.createSpan({
          text: ` ${collection.prefix}${collection.total ? ` · ${collection.total} icons` : ''}`,
        })
        row.addEventListener('click', () => {
          this.selected = collection
          this.resultsEl
            .querySelectorAll('.is-selected')
            .forEach((element) => element.removeClass('is-selected'))
          row.addClass('is-selected')
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.statusEl.setText(`Search failed: ${message}`)
      this.showOffline(message)
    }
  }
  private showOffline(error: string): void {
    if (!this.offlineEl) return
    this.offlineStatusEl.setText(error)
    this.offlineEl.style.display = ''
  }
  private hideOffline(): void {
    if (!this.offlineEl) return
    this.offlineEl.style.display = 'none'
  }
}

import { Modal, Notice, Setting } from 'obsidian'
import type WrapperIconPlugin from './main'
import {
  deleteIconSet,
  downloadIconSet,
  getIconSetDisplayPath,
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
  private searchTimer: number | undefined

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
        if (this.searchTimer !== undefined)
          window.clearTimeout(this.searchTimer)
        this.searchTimer = window.setTimeout(() => {
          void this.refreshResults()
        }, 300)
      }),
    )
    this.statusEl = contentEl.createDiv({
      cls: 'plug-wrap-icon-download-status',
    })
    this.resultsEl = contentEl.createDiv({
      cls: 'plug-wrap-icon-collection-results',
    })
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
            await downloadIconSet(
              this.plugin,
              this.selected.prefix,
              this.icons,
            )
            this.plugin.iconSets = await loadIconSets(this.plugin)
            this.close()
          } catch (error) {
            new Notice(error instanceof Error ? error.message : String(error))
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
      this.statusEl.setText(
        `Search failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

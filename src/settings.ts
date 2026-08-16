import { App, PluginSettingTab, Setting } from 'obsidian'
import type WrapperIconPlugin from './main'

export interface WrapperIconSettings {
  delimiter: string
  suggestDebounce: number
}
export const DEFAULT_SETTINGS: WrapperIconSettings = {
  delimiter: ';',
  suggestDebounce: 100,
}

export class WrapperIconSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: WrapperIconPlugin,
  ) {
    super(app, plugin)
  }
  display(): void {
    const { containerEl } = this
    containerEl.empty()
    new Setting(containerEl)
      .setName('Delimiter')
      .setDesc('The character between the icon name and custom text.')
      .addText((text) =>
        text
          .setValue(this.plugin.settings.delimiter)
          .onChange(async (value) => {
            this.plugin.settings.delimiter = value || ';'
            await this.plugin.saveSettings()
          }),
      )
    new Setting(containerEl)
      .setName('Suggestion debounce')
      .setDesc(
        'Delay before showing icon suggestions while typing (ms). Set to 0 to disable.',
      )
      .addText((text) => {
        text.inputEl.type = 'number'
        text.inputEl.min = '0'
        text.inputEl.max = '5000'
        return text
          .setPlaceholder('100')
          .setValue(String(this.plugin.settings.suggestDebounce))
          .onChange(async (value) => {
            const parsed = parseInt(value, 10)
            const clamped = Number.isNaN(parsed)
              ? DEFAULT_SETTINGS.suggestDebounce
              : Math.min(5000, Math.max(0, parsed))
            this.plugin.settings.suggestDebounce = clamped
            await this.plugin.saveSettings()
          })
      })
    new Setting(containerEl)
      .setName('Download icon set')
      .setDesc('Download iconify icons for offline use.')
      .addButton((button) =>
        button
          .setButtonText('Open downloader')
          .setCta()
          .onClick(() => this.plugin.openDownloader()),
      )
    new Setting(containerEl)
      .setName('Edit styles.css')
      .setDesc('Open the plugin stylesheet in Obsidian.')
      .addButton((button) =>
        button
          .setButtonText('Open CSS')
          .onClick(() => this.plugin.openStylesheet()),
      )
  }
}

import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, TFile } from 'obsidian'
import type WrapperIconPlugin from './main'
import { createIconSvg, findIcon, IconSet } from './icons'
export interface IconSuggestion {
  fullName: string
}
interface IconNameEntry {
  fullName: string
  lower: string
}
export class IconSuggest extends EditorSuggest<IconSuggestion> {
  limit = 15
  // Pre-built index of every icon name, rebuilt lazily whenever the icon sets
  // array is replaced (load / reload / download / delete). This avoids
  // allocating and lowercasing the full name list on every keystroke.
  private index: { sets: IconSet[]; entries: IconNameEntry[] } | null = null
  constructor(private readonly plugin: WrapperIconPlugin) {
    super(plugin.app)
  }
  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null) {
    if (!file) return null
    const line = editor.getLine(cursor.line).slice(0, cursor.ch)
    const match = line.match(/(?:^|\s)`\/ico\s+([^`\n]*)$/)
    if (!match) return null
    return {
      start: { line: cursor.line, ch: line.lastIndexOf('/ico ') + 5 },
      end: cursor,
      query: match[1] || '',
    }
  }
  getSuggestions(context: EditorSuggestContext): IconSuggestion[] {
    const query = context.query.toLowerCase()
    const entries = this.getEntries()
    const result: IconSuggestion[] = []
    // Stop scanning as soon as the limit is reached, instead of filtering the
    // whole index of icon names on every keystroke.
    for (const entry of entries) {
      if (entry.lower.includes(query)) {
        result.push({ fullName: entry.fullName })
        if (result.length >= this.limit) break
      }
    }
    return result
  }
  private getEntries(): IconNameEntry[] {
    if (!this.index || this.index.sets !== this.plugin.iconSets) {
      const sets = this.plugin.iconSets
      this.index = {
        sets,
        entries: sets.flatMap((set) =>
          Object.keys(set.icons).map((name) => {
            const fullName = `${set.prefix}:${name}`
            return { fullName, lower: fullName.toLowerCase() }
          }),
        ),
      }
    }
    return this.index.entries
  }
  renderSuggestion(value: IconSuggestion, el: HTMLElement): void {
    el.empty()
    const found = findIcon(this.plugin.iconSets, value.fullName)
    if (found) {
      const iconEl = el.createSpan({ cls: 'plug-wrap-icon-suggestion-icon' })
      iconEl.appendChild(createIconSvg(found.icon, found.set))
    }
    el.createSpan({ text: value.fullName, cls: 'suggestion-content' })
  }
  selectSuggestion(value: IconSuggestion): void {
    if (!this.context) return
    const { editor } = this.context
    const replacement = `${value.fullName}${this.plugin.settings.delimiter}`
    editor.replaceRange(replacement, this.context.start, this.context.end)
    editor.setCursor({
      line: this.context.start.line,
      ch: this.context.start.ch + replacement.length,
    })
  }
}

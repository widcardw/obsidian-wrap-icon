import {
  debounce,
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  TFile,
} from 'obsidian'
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
  getSuggestions(context: EditorSuggestContext): Promise<IconSuggestion[]> {
    return new Promise((resolve) => {
      const ms = this.plugin.settings.suggestDebounce
      if (ms > 0) {
        this.ensureDebouncedSearch(ms)(context.query, resolve)
      } else {
        resolve(this.search(context.query))
      }
    })
  }
  // Debounce the actual search so that fast typing renders the suggestion list
  // once, instead of rebuilding the whole list (with icon previews) on every
  // keystroke. The interval follows the plugin setting; 0 disables debouncing.
  private debounceMs = 0
  private debouncedSearch:
    | ((
        query: string,
        resolve: (suggestions: IconSuggestion[]) => void,
      ) => void)
    | null = null
  private ensureDebouncedSearch(
    ms: number,
  ): (query: string, resolve: (suggestions: IconSuggestion[]) => void) => void {
    if (!this.debouncedSearch || this.debounceMs !== ms) {
      this.debounceMs = ms
      this.debouncedSearch = debounce(
        (query: string, resolve: (suggestions: IconSuggestion[]) => void) => {
          resolve(this.search(query))
        },
        ms,
        true,
      )
    }
    return this.debouncedSearch
  }
  private search(query: string): IconSuggestion[] {
    const tokens = query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
    if (tokens.length === 0) return []
    const entries = this.getEntries()
    const result: IconSuggestion[] = []
    for (const entry of entries) {
      if (tokens.every((token) => entry.lower.includes(token))) {
        result.push({ fullName: entry.fullName })
        if (result.length >= this.limit) break
      }
    }
    // Lightweight relevance: names that start with a token rank first.
    if (result.length > 1) {
      const score = (name: string) =>
        tokens.filter((token) => name.startsWith(token)).length
      result.sort((a, b) => score(b.fullName) - score(a.fullName))
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

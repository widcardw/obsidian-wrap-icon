import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, TFile } from 'obsidian'
import type WrapperIconPlugin from './main'
export interface IconSuggestion {
  fullName: string
}
export class IconSuggest extends EditorSuggest<IconSuggestion> {
  limit = 20
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
    return this.plugin.iconSets
      .flatMap((set) =>
        Object.keys(set.icons).map((name) => ({ fullName: `${set.prefix}:${name}` })),
      )
      .filter((item) => item.fullName.toLowerCase().includes(query))
      .slice(0, this.limit)
  }
  renderSuggestion(value: IconSuggestion, el: HTMLElement): void {
    el.setText(value.fullName)
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

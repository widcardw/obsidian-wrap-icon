import { EditorView, Decoration, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'
import type WrapperIconPlugin from './main'
import { createIconSvg, findIcon, IconData, IconSet } from './icons'

class InlineIconWidget extends WidgetType {
  constructor(
    private readonly icon: IconData,
    private readonly set: IconSet,
    private readonly text: string,
    private readonly sourceFrom: number,
    private readonly sourceTo: number,
    private readonly activate: () => void,
  ) {
    super()
  }
  toDOM(view: EditorView): HTMLElement {
    const wrapper = createSpan()
    wrapper.className = 'plug-wrap-icon plug-wrap-icon-live-preview'
    wrapper.addEventListener('mousedown', (event) => {
      event.preventDefault()
      this.activate()
      view.dispatch({ selection: { anchor: this.sourceFrom, head: this.sourceTo } })
    })
    wrapper.appendChild(createIconSvg(this.icon, this.set))
    const label = createSpan()
    label.className = 'plug-wrap-icon-text'
    label.textContent = this.text
    wrapper.appendChild(label)
    return wrapper
  }
  ignoreEvent(): boolean {
    return false
  }
  eq(widget: WidgetType): boolean {
    return (
      widget instanceof InlineIconWidget &&
      widget.icon.body === this.icon.body &&
      widget.set.prefix === this.set.prefix &&
      widget.text === this.text &&
      widget.sourceFrom === this.sourceFrom &&
      widget.sourceTo === this.sourceTo
    )
  }
}

class LivePreviewDecorations {
  decorations = Decoration.none
  private editingRange: { from: number; to: number } | null = null
  constructor(
    private readonly view: EditorView,
    private readonly plugin: WrapperIconPlugin,
  ) {
    this.rebuild()
    this.view.requestMeasure({
      read: () => undefined,
      write: () => this.rebuild(),
    })
  }
  update(update: ViewUpdate): void {
    if (update.docChanged && this.editingRange) {
      this.editingRange = {
        from: update.changes.mapPos(this.editingRange.from, 1),
        to: update.changes.mapPos(this.editingRange.to, -1),
      }
    }
    if (update.selectionSet && this.editingRange && !this.selectionIsInEditingRange()) {
      this.editingRange = null
    }
    if (update.docChanged || update.viewportChanged || update.selectionSet) {
      this.rebuild()
    }
  }
  rebuild(): void {
    const builder = new RangeSetBuilder<Decoration>()
    const ranges = this.view.visibleRanges.length
      ? this.view.visibleRanges
      : [{ from: 0, to: this.view.state.doc.length }]
    for (const { from, to } of ranges) {
      let position = from
      while (position < to) {
        const line = this.view.state.doc.lineAt(position)
        const lineEnd = Math.min(line.to, to)
        const source = this.view.state.sliceDoc(line.from, lineEnd)
        const escapedDelimiter = this.plugin.settings.delimiter.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&',
        )
        const pattern = new RegExp(
          '`\\/ico\\s+([^\\s' + escapedDelimiter + '`]+)' + escapedDelimiter + '([^`]*)`',
          'g',
        )
        let match: RegExpExecArray | null
        while ((match = pattern.exec(source))) {
          const start = line.from + match.index
          const end = start + match[0].length
          if (this.isActiveRange(start, end)) continue
          const found = findIcon(this.plugin.iconSets, match[1] || '')
          if (!found) continue
          builder.add(
            start,
            end,
            Decoration.replace({
              widget: new InlineIconWidget(
                found.icon,
                found.set,
                match[2] || '',
                start,
                end,
                () => {
                  this.editingRange = { from: start, to: end }
                  this.rebuild()
                },
              ),
              inclusive: false,
            }),
          )
        }
        position = line.to + 1
      }
    }
    this.decorations = builder.finish()
  }
  private isActiveRange(start: number, end: number): boolean {
    if (this.editingRange?.from === start && this.editingRange.to === end) return true
    for (const range of this.view.state.selection.ranges) {
      if (range.from === range.to) {
        if (range.from > start && range.from < end) return true
      } else if (range.from < end && range.to > start) {
        return true
      }
    }
    return false
  }
  private selectionIsInEditingRange(): boolean {
    if (!this.editingRange) return false
    return this.view.state.selection.ranges.some((range) => {
      if (range.from === range.to) {
        return range.from > this.editingRange!.from && range.from < this.editingRange!.to
      }
      return range.from < this.editingRange!.to && range.to > this.editingRange!.from
    })
  }
}

export function createLivePreviewExtension(plugin: WrapperIconPlugin) {
  return ViewPlugin.fromClass(
    class extends LivePreviewDecorations {
      constructor(view: EditorView) {
        super(view, plugin)
      }
    },
    { decorations: (value) => value.decorations },
  )
}

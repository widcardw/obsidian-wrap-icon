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
    // Compare content only, not source positions: the source coordinates shift
    // whenever text before an icon is edited, and treating that as a change
    // would tear down and rebuild every widget on each keystroke.
    return (
      widget instanceof InlineIconWidget &&
      widget.icon.body === this.icon.body &&
      widget.set.prefix === this.set.prefix &&
      widget.text === this.text
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
      try {
        this.rebuild()
      } catch (error) {
        // Never let a rebuild failure propagate: CodeMirror would deactivate
        // the whole plugin and every widget would disappear permanently.
        console.error('Wrapper Icon: failed to rebuild decorations', error)
        this.decorations = Decoration.none
      }
    }
  }
  rebuild(): void {
    const builder = new RangeSetBuilder<Decoration>()
    const ranges = this.view.visibleRanges.length
      ? this.view.visibleRanges
      : [{ from: 0, to: this.view.state.doc.length }]
    // visibleRanges can be split (e.g. by folded blocks) with a boundary in the
    // middle of a line; lineAt() then returns the whole line from its start, so
    // the same icon can be matched again. Skip anything already added.
    let lastDecorationEnd = -1
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
          if (start < lastDecorationEnd) continue
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
          lastDecorationEnd = end
        }
        position = line.to + 1
      }
    }
    this.decorations = builder.finish()
  }
  private isActiveRange(start: number, end: number): boolean {
    if (this.editingRange?.from === start && this.editingRange.to === end) return true
    for (const range of this.view.state.selection.ranges) {
      // Only a collapsed cursor inside the icon source counts as editing it.
      // A non-collapsed selection overlapping the icon keeps the widget
      // visible (matching CodeMirror's default behavior for replace
      // decorations), otherwise selecting text makes icons vanish.
      if (range.from === range.to && range.from > start && range.from < end) return true
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

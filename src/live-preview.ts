import { EditorView, Decoration, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
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
    const doc = this.view.state.doc
    const escapedDelimiter = this.plugin.settings.delimiter.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    )
    // Match the icon syntax inside a single inline-code node (its text includes
    // the wrapping backticks after the range is expanded below).
    const pattern = new RegExp(
      '^`\\/ico\\s+([^\\s' + escapedDelimiter + '`]+)' + escapedDelimiter + '([^`]*)`$',
    )
    // Locate icons through the syntax tree instead of scanning raw text: the
    // tree knows the real inline-code context, so code blocks, escaped
    // backticks, etc. are never treated as icons (matching Reading View).
    let lastDecorationEnd = -1
    for (const { from, to } of ranges) {
      syntaxTree(this.view.state).iterate({
        from,
        to,
        enter: (node) => {
          if (!node.type.name.includes('inline-code')) return
          // Skip the formatting (backtick) nodes; handle the content node.
          if (node.type.name.includes('formatting')) return
          let start = node.from
          let end = node.to
          // The inline-code content node excludes the backticks; include them
          // so the full `` `/ico ...` `` source is matched.
          if (start > 0 && doc.sliceString(start - 1, start) === '`') start--
          if (end < doc.length && doc.sliceString(end, end + 1) === '`') end++
          if (start < lastDecorationEnd) return
          const match = pattern.exec(doc.sliceString(start, end))
          if (!match) return
          if (this.isActiveRange(start, end)) return
          const found = findIcon(this.plugin.iconSets, match[1] || '')
          if (!found) return
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
        },
      })
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

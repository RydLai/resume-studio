import { useEffect, useRef, useState } from "react";
import { basicSetup } from "codemirror";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  HighlightStyle,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";

const editorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "#fdfdfb",
      color: "#1f2328",
      fontSize: "13.5px",
    },
    "&.cm-focused": {
      outline: "none",
    },
    ".cm-scroller": {
      fontFamily:
        '"Cascadia Code", "JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
      lineHeight: "1.75",
      overflow: "auto",
    },
    ".cm-content": {
      padding: "18px 0 64px",
      caretColor: "#111111",
    },
    ".cm-line": {
      padding: "0 22px",
    },
    ".cm-gutters": {
      backgroundColor: "#f7f7f4",
      color: "#a6a6a0",
      border: "none",
      paddingLeft: "8px",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 8px 0 4px",
      minWidth: "32px",
    },
    ".cm-activeLine": {
      // 实心行背景会盖住 CodeMirror 位于 z-index:-2 的选区层，
      // 导致“选中当前行文字时看不到高亮”。用左侧细标记替代。
      backgroundColor: "transparent !important",
      boxShadow: "inset 2px 0 0 #e3e2da",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "#4f5459",
    },
    ".cm-selectionBackground": {
      backgroundColor: "#c9d6e8 !important",
    },
    "&.cm-focused .cm-selectionBackground": {
      backgroundColor: "#b9cde6 !important",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#111111",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "#ecece7",
      border: "1px solid #dcdcd6",
      color: "#6b7075",
    },
    ".cm-panels": {
      backgroundColor: "#f7f7f4",
      color: "#1f2328",
    },
    ".cm-searchMatch": {
      backgroundColor: "#f3e6b8",
      outline: "1px solid #dcc57a",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "#e9d58e",
    },
    ".cm-tooltip": {
      border: "1px solid #dcdcd6",
      backgroundColor: "#ffffff",
    },
  },
  { dark: false },
);

const highlightStyle = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "700", color: "#111111" },
  { tag: tags.strong, fontWeight: "700", color: "#111111" },
  { tag: tags.emphasis, fontStyle: "italic", color: "#333333" },
  { tag: tags.link, color: "#37546b", textDecoration: "underline" },
  { tag: tags.url, color: "#6b7075" },
  { tag: tags.monospace, color: "#444a4f" },
  { tag: tags.meta, color: "#8a8f94" },
  { tag: tags.processingInstruction, color: "#8a8f94" },
  { tag: tags.contentSeparator, color: "#9aa0a6" },
  { tag: tags.quote, color: "#6b7075" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
]);

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  dirty: boolean;
  statusText: string;
  readOnly?: boolean;
}

interface CursorState {
  line: number;
  column: number;
  characters: number;
  lines: number;
}

const EMPTY_CURSOR: CursorState = {
  line: 1,
  column: 1,
  characters: 0,
  lines: 1,
};

export function MarkdownEditor({
  value,
  onChange,
  dirty,
  statusText,
  readOnly = false,
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const [cursor, setCursor] = useState<CursorState>(EMPTY_CURSOR);

  valueRef.current = value;
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hostRef.current) return;

    const reportState = (view: EditorView) => {
      const head = view.state.selection.main.head;
      const line = view.state.doc.lineAt(head);
      setCursor({
        line: line.number,
        column: head - line.from + 1,
        characters: view.state.doc.length,
        lines: view.state.doc.lines,
      });
    };

    const view = new EditorView({
      state: EditorState.create({
        doc: valueRef.current,
        extensions: [
          basicSetup,
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          markdown(),
          EditorView.lineWrapping,
          EditorState.tabSize.of(2),
          indentUnit.of("  "),
          indentOnInput(),
          syntaxHighlighting(highlightStyle),
          editorTheme,
          keymap.of([indentWithTab]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
            if (update.docChanged || update.selectionSet) {
              reportState(update.view);
            }
          }),
        ],
      }),
      parent: hostRef.current,
    });

    viewRef.current = view;
    reportState(view);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Editor 只创建一次；回调通过 ref 取最新值。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: { anchor: 0 },
    });
  }, [value]);

  return (
    <section className="editor-pane" aria-label="Markdown 编辑器">
      <div className="pane-head">
        <div className="pane-title">
          <span className="pane-title-text">Markdown</span>
          <span className="pane-subtle">源文件</span>
        </div>
        <div className="pane-meta">
          <span>UTF-8</span>
          <span className="pane-meta-sep" aria-hidden="true" />
          <span>Markdown</span>
        </div>
      </div>

      <div className="editor-host" ref={hostRef} />

      <footer className="editor-status">
        <div className="editor-status-left">
          <span>
            第 {cursor.line} 行，第 {cursor.column} 列
          </span>
          <span className="status-sep" aria-hidden="true" />
          <span>{cursor.characters.toLocaleString("zh-CN")} 字符</span>
          <span className="status-sep" aria-hidden="true" />
          <span>{cursor.lines} 行</span>
        </div>
        <div className="editor-status-right">
          <span className={`save-indicator${dirty ? " is-dirty" : ""}`}>
            <span className="save-dot" aria-hidden="true" />
            {statusText}
          </span>
        </div>
      </footer>
    </section>
  );
}

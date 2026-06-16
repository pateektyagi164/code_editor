import Editor from '@monaco-editor/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useRoom } from '../../contexts/RoomContext.jsx'
import { useCRDT } from '../../hooks/useCRDT.js'

export const LANGUAGE_OPTIONS = [
  { id: 71, label: 'Python', monaco: 'python', icon: 'PY' },
  { id: 93, label: 'Node.js', monaco: 'javascript', icon: 'JS' },
  { id: 74, label: 'TypeScript', monaco: 'typescript', icon: 'TS' },
  { id: 54, label: 'C++', monaco: 'cpp', icon: 'C++' },
  { id: 50, label: 'C', monaco: 'c', icon: 'C' },
  { id: 91, label: 'Java', monaco: 'java', icon: 'JV' },
  { id: 73, label: 'Rust', monaco: 'rust', icon: 'RS' },
  { id: 60, label: 'Go', monaco: 'go', icon: 'GO' },
  { id: 72, label: 'Ruby', monaco: 'ruby', icon: 'RB' },
  { id: 51, label: 'C#', monaco: 'csharp', icon: 'C#' },
  { id: 68, label: 'PHP', monaco: 'php', icon: 'PHP' },
  { id: 83, label: 'Swift', monaco: 'swift', icon: 'SW' },
  { id: 78, label: 'Kotlin', monaco: 'kotlin', icon: 'KT' },
  { id: 80, label: 'R', monaco: 'r', icon: 'R' },
  { id: 90, label: 'Dart', monaco: 'dart', icon: 'DT' },
  { id: 81, label: 'Scala', monaco: 'scala', icon: 'SC' },
  { id: 46, label: 'Bash', monaco: 'shell', icon: 'SH' },
  { id: 82, label: 'SQL', monaco: 'sql', icon: 'SQL' },
]

export function resolveLanguage(languageId) {
  return LANGUAGE_OPTIONS.find((language) => language.id === Number(languageId)) ?? LANGUAGE_OPTIONS[0]
}

export const DEFAULT_EDITOR_CONTENT = `def greet(name: str) -> str:
    """Real-time collaborative editing powered by Yjs + CRDT."""
    return f"Hello, {name}!"


if __name__ == "__main__":
    print(greet("World"))`

export default function MonacoWrapper({
  filename = 'main.py',
  languageId = 71,
  onLanguageChange,
  activeFileId = 'main',
  fileTree = [],
  initialContent = DEFAULT_EDITOR_CONTENT,
  getCodeRef,
  setFileContentRef,
  getAllFilesContentRef,
  executionResult,
}) {
  const { user, isAuthenticated, setShowLogin } = useAuth()
  const { roomId, send, connected, addMessageListener } = useRoom()
  const { bindEditor, getContent, setFileContent, getAllFilesContent } = useCRDT({
    send,
    addMessageListener,
    connected,
    fileTree,
    activeFileId,
    initialContent,
    user,
  })
  const [cursor, setCursor] = useState({ line: 1, column: 1 })
  const selectedLanguage = resolveLanguage(languageId)
  const editorRef = useRef(null)
  const monacoRef = useRef(null)

  useEffect(() => {
    if (getCodeRef) {
      getCodeRef.current = getContent
    }
    if (setFileContentRef) {
      setFileContentRef.current = setFileContent
    }
    if (getAllFilesContentRef) {
      getAllFilesContentRef.current = getAllFilesContent
    }
  }, [getCodeRef, setFileContentRef, getAllFilesContentRef, getContent, setFileContent, getAllFilesContent])

  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    const model = editor?.getModel()
    if (!editor || !monaco || !model) {
      return
    }

    monaco.editor.setModelMarkers(model, 'execution', [])
    if (!executionResult?.stderr || !executionResult?.error_line) {
      return
    }

    const line = Math.min(executionResult.error_line, model.getLineCount())
    const column = Math.max(1, executionResult.error_column || 1)
    monaco.editor.setModelMarkers(model, 'execution', [
      {
        startLineNumber: line,
        startColumn: column,
        endLineNumber: line,
        endColumn: model.getLineMaxColumn(line),
        message: executionResult.stderr.split('\n')[0] || executionResult.status || 'Execution error',
        severity: monaco.MarkerSeverity.Error,
      },
    ])
    editor.revealLineInCenter(line)
  }, [executionResult, activeFileId])

  const handleMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco
      bindEditor(editor, editor.getModel())

      editor.onDidChangeCursorPosition(({ position }) => {
        setCursor({ line: position.lineNumber, column: position.column })
      })
    },
    [bindEditor],
  )

  return (
    <div className="panel flex flex-col flex-1 min-h-0 shadow-glow">
      <div className="panel-header flex items-center justify-between">
        <span className="truncate">{filename}</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex w-2 h-2 rounded-full ${
                connected ? 'bg-emerald-400 shadow-glow-accent' : 'bg-slate-600'
              }`}
            />
            <span className="text-xs text-slate-500">
              {isAuthenticated ? (connected ? 'Synced' : 'Connecting…') : 'Offline'}
            </span>
          </div>
          <select
            value={selectedLanguage.id}
            onChange={(event) => onLanguageChange?.(Number(event.target.value))}
            className="px-2 py-1 text-xs font-medium rounded-lg bg-slate-950 border border-slate-700/50 text-slate-300 focus:outline-none focus:border-accent/40"
            aria-label="Editor language"
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {!isAuthenticated ? (
          <div className="flex flex-col items-center justify-center h-full p-6 gap-4">
            <p className="text-sm text-slate-400 text-center leading-relaxed">
              Sign in to join the collaborative editing session.
            </p>
            <button
              type="button"
              onClick={() => setShowLogin(true)}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 hover:shadow-glow transition-all duration-200"
            >
              Sign In
            </button>
          </div>
        ) : (
          <Editor
            height="100%"
            language={selectedLanguage.monaco}
            theme="vs-dark"
            onMount={handleMount}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              fontFamily: 'JetBrains Mono, Fira Code, monospace',
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 16 },
            }}
          />
        )}
      </div>

      <div className="border-t border-slate-700/50 px-4 py-2 flex items-center justify-between text-xs text-slate-500">
        <span>
          Ln {cursor.line}, Col {cursor.column}
        </span>
        <span className="font-mono">room/{roomId}</span>
      </div>
    </div>
  )
}

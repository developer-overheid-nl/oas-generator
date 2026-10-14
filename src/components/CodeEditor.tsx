import { json, jsonParseLinter } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { Diagnostic, forEachDiagnostic, linter, lintGutter, setDiagnosticsEffect } from '@codemirror/lint';
import ReactCodeMirror, { EditorSelection, EditorView, Extension } from '@uiw/react-codemirror';
import clsx from 'clsx';
import { AlertCircle, SquareArrowOutUpRight } from 'lucide-react';
import { FC, useMemo, useState } from 'react';
import { convertContent, detectEncoding, Encoding, EncodingId, jsonEncoding, yamlEncoding } from '../encodings';
import { useScrollbarWidth } from '../hooks';
import { populateOpenApiSpec } from '../populateOas';
import { Spec } from '../types';
import { groupBy, groupBySource } from '../util';
import FormatToggle from './FormatToggle';

const LANGUAGE_EXTENSIONS: Record<EncodingId, Extension[]> = {
  json: [json(), linter(jsonParseLinter())],
  yaml: [yaml()],
};

const SEVERITY_ORDER: Diagnostic['severity'][] = ['error', 'warning', 'info', 'hint'];

const SEVERITY_LABELS: Record<Diagnostic['severity'], string> = {
  error: 'Errors',
  warning: 'Warnings',
  info: 'Info',
  hint: 'Hints',
};

/**
 * Generates the OpenAPI document for the given input, in the given encoding.
 * Returns undefined while the input cannot be parsed or is incomplete.
 */
const generateOutput = (content: string, outputEncoding: Encoding): string | undefined => {
  try {
    const input = detectEncoding(content).parse(content);
    const output = populateOpenApiSpec(JSON.stringify(input));
    return convertContent(jsonEncoding, outputEncoding, output);
  } catch {
    return undefined;
  }
};

const LoadingIndicator: FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center gap-3 rounded-sm bg-white p-4 text-slate-700 shadow-lg" role="status" aria-live="polite">
    <span aria-hidden="true" className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
    <span className="font-medium">{label}</span>
  </div>
);

interface Props {
  spec: Spec;
}

const CodeEditor: FC<Props> = ({ spec }) => {
  const [content, setContent] = useState(spec.example);
  const [outputEncoding, setOutputEncoding] = useState<Encoding>(yamlEncoding);
  const [checking, setChecking] = useState(false);
  const linters = spec.linters;
  const [diagnostics, setDiagnostics] = useState<{ [key: string]: Diagnostic[] }>({});
  const [inputView, setInputView] = useState<EditorView>();
  const [outputView, setOutputView] = useState<EditorView>();
  const inputScrollbarWidth = useScrollbarWidth(inputView);
  const outputScrollbarWidth = useScrollbarWidth(outputView);

  const inputEncoding = useMemo(() => detectEncoding(content), [content]);
  const output = useMemo(() => generateOutput(content, outputEncoding), [content, outputEncoding]);
  const hasDiagnostics = Object.keys(diagnostics).length > 0;

  const switchInputEncoding = (target: Encoding) => {
    try {
      setContent(convertContent(inputEncoding, target, content));
    } catch {
      // Unparseable input stays as it is; the linter already reports why.
    }
  };

  const showInEditor = (diagnostic: Diagnostic) =>
    inputView?.dispatch({
      selection: EditorSelection.single(diagnostic.from, diagnostic.to),
      scrollIntoView: true,
    });

  return (
    <div className="flex h-full">
      <div className="relative w-[50%] min-w-[400px] overflow-hidden">
        <ReactCodeMirror
          value={content}
          height="100%"
          style={{ height: '100%' }}
          extensions={[lintGutter(), ...LANGUAGE_EXTENSIONS[inputEncoding.id], ...linters.map(l => l.linter)]}
          onCreateEditor={setInputView}
          onUpdate={viewUpdate => {
            viewUpdate.transactions.forEach(transaction => {
              transaction.effects.forEach(effect => {
                if (effect.is(setDiagnosticsEffect)) {
                  const diagnostics: Diagnostic[] = [];
                  forEachDiagnostic(viewUpdate.state, d => diagnostics.push(d));
                  setDiagnostics(groupBySource(diagnostics));
                  setChecking(false);
                }
              });
            });

            if (viewUpdate.docChanged) {
              setContent(viewUpdate.state.doc.toString());
              setChecking(true);
            }
          }}
        />
        <FormatToggle
          active={inputEncoding}
          onSwitch={switchInputEncoding}
          className="absolute top-2 z-10"
          style={{ right: inputScrollbarWidth + 12 }}
        />
      </div>
      {!hasDiagnostics && output !== undefined ? (
        <div className="relative flex-1 min-w-[400px] overflow-hidden">
          <ReactCodeMirror
            value={output}
            height="100%"
            style={{ height: '100%' }}
            extensions={LANGUAGE_EXTENSIONS[outputEncoding.id]}
            readOnly={true}
            onCreateEditor={setOutputView}
          />
          <FormatToggle
            active={outputEncoding}
            onSwitch={setOutputEncoding}
            className="absolute top-2 z-10"
            style={{ right: outputScrollbarWidth + 12 }}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4 bg-sky-50 text-sm">
          {!hasDiagnostics && checking && <LoadingIndicator label="Generating..." />}
          {Object.entries(diagnostics).map(([source, sourceDiagnostics]) => {
            const grouped = groupBy(sourceDiagnostics, d => d.severity);
            return (
              <div key={source}>
                <div className={clsx('mb-4 p-4 rounded-sm shadow-lg text-white', grouped.error ? 'bg-red-500' : 'bg-orange-400')}>
                  {source && `[${source}] `}Found {sourceDiagnostics.length} issue(s).
                </div>
                {SEVERITY_ORDER.filter(severity => grouped[severity]).map(severity => (
                  <div key={severity} className="mb-4">
                    <h3 className={clsx('severity-group', `severity-group-${severity}`)}>
                      {SEVERITY_LABELS[severity]} ({grouped[severity].length})
                    </h3>
                    <ul>
                      {grouped[severity].map((diagnostic, i) => (
                        <li key={i}>
                          <div className={clsx('diagnostic', `diagnostic-${severity}`)}>
                            <AlertCircle size={28} className="shrink-0" />
                            <div>
                              <span>{diagnostic.message}</span>
                              <div className="flex gap-2 mt-2">
                                <button className="btn" onClick={() => showInEditor(diagnostic)}>
                                  Show in editor
                                  <SquareArrowOutUpRight size={12} strokeWidth={2} className="ml-1.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CodeEditor;

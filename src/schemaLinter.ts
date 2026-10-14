import betterAjvErrors from '@stoplight/better-ajv-errors';
import { syntaxTree } from '@codemirror/language';
import { Diagnostic, linter } from '@codemirror/lint';
import { Extension } from '@uiw/react-codemirror';
import addFormats from 'ajv-formats';
import Ajv, { AnySchemaObject } from 'ajv/dist/2020';
import { detectEncoding } from './encodings';

// The concrete syntax-node type used by the JSON language, derived without
// importing @lezer/common directly (which is not a direct dependency).
type SyntaxNode = NonNullable<ReturnType<typeof syntaxTree>['topNode']['firstChild']>;

const VALUE_TYPES = new Set(['Object', 'Array', 'String', 'Number', 'True', 'False', 'Null']);

const firstValueChild = (node: SyntaxNode): SyntaxNode | null => {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (VALUE_TYPES.has(child.name)) {
      return child;
    }
  }
  return null;
};

const valueChildren = (node: SyntaxNode): SyntaxNode[] => {
  const children: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (VALUE_TYPES.has(child.name)) {
      children.push(child);
    }
  }
  return children;
};

const propertyValue = (property: SyntaxNode): SyntaxNode | null => {
  for (let child = property.lastChild; child; child = child.prevSibling) {
    if (VALUE_TYPES.has(child.name)) {
      return child;
    }
  }
  return null;
};

const findProperty = (object: SyntaxNode, key: string, sliceDoc: (from: number, to: number) => string): SyntaxNode | null => {
  for (let child = object.firstChild; child; child = child.nextSibling) {
    if (child.name !== 'Property') {
      continue;
    }

    const nameNode = child.getChild('PropertyName');
    if (!nameNode) {
      continue;
    }

    try {
      if (JSON.parse(sliceDoc(nameNode.from, nameNode.to)) === key) {
        return child;
      }
    } catch {
      // Ignore malformed property names while the user is still typing.
    }
  }

  return null;
};

/**
 * Resolves a JSON Pointer (RFC 6901) to a range in the document, so a schema
 * violation can be highlighted in the editor.
 *
 * @param root      The root value node of the JSON document
 * @param pointer   The JSON Pointer to the offending value (e.g. "/contact/email")
 * @param sliceDoc  Returns the document text between two offsets
 * @param docLength The length of the document, used as a fallback range
 */
export const resolveRange = (
  root: SyntaxNode | null,
  pointer: string,
  sliceDoc: (from: number, to: number) => string,
  docLength: number,
): { from: number; to: number } => {
  if (!root) {
    return { from: 0, to: docLength };
  }

  const segments =
    pointer === ''
      ? []
      : pointer
          .split('/')
          .slice(1)
          .map(segment => segment.replace(/~1/g, '/').replace(/~0/g, '~'));

  let target = root;

  for (const segment of segments) {
    if (target.name === 'Object') {
      const property = findProperty(target, segment, sliceDoc);
      if (!property) {
        break;
      }
      target = propertyValue(property) ?? property;
    } else if (target.name === 'Array') {
      const values = valueChildren(target);
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= values.length) {
        break;
      }
      target = values[index];
    } else {
      break;
    }
  }

  // Highlight only the opening token of a container, but the whole value of a scalar.
  if (target.name === 'Object' || target.name === 'Array') {
    return { from: target.from, to: target.from + 1 };
  }

  return { from: target.from, to: target.to };
};

const YAML_KEY_LINE = /^(\s*)(?:-\s+)?(?:(?:"([^"]*)")|(?:'([^']*)')|([^"':\s#][^:#]*))\s*:/;

/**
 * Maps every key path in a YAML document to the line it is defined on. Keys of
 * mappings inside sequences are recorded without the item index.
 */
const buildYamlPathLines = (lines: string[]): Map<string, { line: number; indent: number }> => {
  const pathLines = new Map<string, { line: number; indent: number }>();
  const stack: { indent: number; key: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(YAML_KEY_LINE);
    if (!match) {
      continue;
    }

    const indent = match[1].length;
    const key = (match[2] ?? match[3] ?? match[4]).trim();

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    stack.push({ indent, key });
    pathLines.set(stack.map(entry => entry.key).join('\0'), { line: i, indent });
  }

  return pathLines;
};

/**
 * Resolves a JSON Pointer to a range in a YAML document, line based. It
 * highlights the deepest key on the pointer that it can find, including its
 * nested block; array indices are not resolved, so an error inside a sequence
 * item lands on the sequence itself.
 *
 * @param content The YAML document
 * @param pointer The JSON Pointer to the offending value
 */
export const resolveYamlRange = (content: string, pointer: string): { from: number; to: number } => {
  const lines = content.split('\n');
  const lineStarts: number[] = [0];
  for (let i = 1; i < lines.length; i++) {
    lineStarts.push(lineStarts[i - 1] + lines[i - 1].length + 1);
  }
  const pathLines = buildYamlPathLines(lines);
  const keys =
    pointer === ''
      ? []
      : pointer
          .split('/')
          .slice(1)
          .map(segment => segment.replace(/~1/g, '/').replace(/~0/g, '~'));

  for (let length = keys.length; length > 0; length--) {
    const entry = pathLines.get(keys.slice(0, length).join('\0'));
    if (entry === undefined) {
      continue;
    }

    let endLine = entry.line;
    for (let i = entry.line + 1; i < lines.length; i++) {
      const trimmed = lines[i].trimStart();
      if (trimmed === '' || trimmed.startsWith('#')) {
        continue;
      }
      if (lines[i].search(/\S/) <= entry.indent) {
        break;
      }
      endLine = i;
    }

    return { from: lineStarts[entry.line], to: lineStarts[endLine] + lines[endLine].length };
  }

  return { from: 0, to: lines[0].length };
};

/**
 * Creates a CodeMirror linter that validates the JSON or YAML document against
 * a JSON Schema using Ajv, mapping each violation to a range in the editor.
 *
 * @param name    The source name used to group the diagnostics
 * @param schema  The JSON Schema to validate against
 */
export const schemaLinter = (name: string, schema: object): Extension => {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema as AnySchemaObject);

  return linter(view => {
    const content = view.state.doc.toString();
    const encoding = detectEncoding(content);
    let data: unknown;

    try {
      data = encoding.parse(content);
    } catch {
      // Unparseable content is detected as JSON and reported by the JSON parse linter.
      return [];
    }

    if (validate(data)) {
      return [];
    }

    const sliceDoc = (from: number, to: number) => view.state.doc.sliceString(from, to);
    const resolve = (path: string) =>
      encoding.id === 'yaml'
        ? resolveYamlRange(content, path)
        : resolveRange(firstValueChild(syntaxTree(view.state).topNode), path, sliceDoc, view.state.doc.length);

    return betterAjvErrors(schema as AnySchemaObject, validate.errors ?? [], {
      propertyPath: [],
      targetValue: data,
    }).map<Diagnostic>(({ suggestion, error, path }) => ({
      source: name,
      severity: 'error',
      message: suggestion !== undefined ? `${error}. ${suggestion}` : error,
      ...resolve(path),
    }));
  });
};

export default schemaLinter;

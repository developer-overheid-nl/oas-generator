import { Decoration, DecorationSet, EditorView, Extension, hoverTooltip, ViewPlugin, ViewUpdate } from '@uiw/react-codemirror';
import { detectEncoding } from './encodings';

export interface SchemaUrl {
  from: number;
  to: number;
  url: string;
}

// A `schema` key (not `$schema`) with an http(s) URL as value, in JSON
// (`"schema": "https://..."`) or YAML (`schema: https://...`, optionally quoted).
const SCHEMA_URL_PATTERN = /(?<![\w$])"?schema"?\s*:[ \t]*(["']?)(https?:\/\/[^\s"']+)\1/g;

/**
 * Finds the URLs of external resource schemas in an input document, with
 * their position in the document.
 */
export const findSchemaUrls = (content: string): SchemaUrl[] =>
  Array.from(content.matchAll(SCHEMA_URL_PATTERN), match => {
    const [fullMatch, quote, url] = match;
    const to = match.index + fullMatch.length - quote.length;
    return { from: to - url.length, to, url };
  });

/**
 * Formats a fetched schema for the preview: JSON and YAML are shown as
 * indented JSON, anything else as-is.
 */
export const formatSchemaPreview = (content: string): string => {
  try {
    const parsed = detectEncoding(content).parse(content);
    return typeof parsed === 'object' && parsed !== null ? JSON.stringify(parsed, null, 2) : content;
  } catch {
    return content;
  }
};

type SchemaPreview = { isLoaded: true; content: string } | { isLoaded: false; message: string };

const previewCache = new Map<string, Promise<SchemaPreview>>();

const fetchSchemaPreview = async (url: string): Promise<SchemaPreview> => {
  try {
    const response = await fetch(url, { headers: { Accept: 'application/schema+json, application/json, */*' } });
    if (!response.ok) {
      return { isLoaded: false, message: `Could not load schema (status code ${response.status}).` };
    }
    return { isLoaded: true, content: formatSchemaPreview(await response.text()) };
  } catch {
    return { isLoaded: false, message: 'Could not load schema (network error or blocked by CORS).' };
  }
};

// Successful previews are cached per URL; failures are retried on the next hover.
const loadSchemaPreview = (url: string): Promise<SchemaPreview> => {
  const cached = previewCache.get(url);
  if (cached) {
    return cached;
  }
  const preview = fetchSchemaPreview(url).then(result => {
    if (!result.isLoaded) {
      previewCache.delete(url);
    }
    return result;
  });
  previewCache.set(url, preview);
  return preview;
};

const openUrl = (url: string): void => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

const createLinkDecorations = (view: EditorView): DecorationSet =>
  Decoration.set(
    findSchemaUrls(view.state.doc.toString()).map(({ from, to, url }) =>
      Decoration.mark({ class: 'cm-schema-link', attributes: { 'data-url': url } }).range(from, to),
    ),
  );

const linkDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = createLinkDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged) {
        this.decorations = createLinkDecorations(update.view);
      }
    }
  },
  { decorations: plugin => plugin.decorations },
);

// A plain click keeps placing the cursor, so the URL stays editable;
// Cmd/Ctrl+click opens it.
const linkClickHandler = EditorView.domEventHandlers({
  click: event => {
    if (!(event.metaKey || event.ctrlKey) || !(event.target instanceof Element)) {
      return false;
    }
    const url = event.target.closest('.cm-schema-link')?.getAttribute('data-url');
    if (!url) {
      return false;
    }
    openUrl(url);
    return true;
  },
});

const createPreviewDom = (url: string, preview: SchemaPreview): HTMLElement => {
  const container = document.createElement('div');
  container.className = 'schema-preview';

  const header = document.createElement('div');
  header.className = 'schema-preview-header';
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open schema';
  const hint = document.createElement('span');
  hint.textContent = 'or Cmd/Ctrl+click the URL';
  header.append(link, hint);

  const body = document.createElement(preview.isLoaded ? 'pre' : 'p');
  body.className = preview.isLoaded ? 'schema-preview-content' : 'schema-preview-error';
  body.textContent = preview.isLoaded ? preview.content : preview.message;

  container.append(header, body);
  return container;
};

const schemaPreviewTooltip = hoverTooltip(async (view, position) => {
  const schemaUrl = findSchemaUrls(view.state.doc.toString()).find(({ from, to }) => position >= from && position <= to);
  if (!schemaUrl) {
    return null;
  }
  const preview = await loadSchemaPreview(schemaUrl.url);
  return {
    pos: schemaUrl.from,
    end: schemaUrl.to,
    above: true,
    create: () => ({ dom: createPreviewDom(schemaUrl.url, preview) }),
  };
});

/**
 * Makes external resource schema URLs in the input clickable (Cmd/Ctrl+click)
 * and shows a preview of the schema on hover.
 */
export const schemaLinks = (): Extension => [linkDecorations, linkClickHandler, schemaPreviewTooltip];

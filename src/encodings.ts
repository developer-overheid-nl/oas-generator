import { dump, load } from 'js-yaml';

export type EncodingId = 'json' | 'yaml';

export interface Encoding {
  id: EncodingId;
  label: string;
  parse: (content: string) => unknown;
  stringify: (value: unknown) => string;
}

export const jsonEncoding: Encoding = {
  id: 'json',
  label: 'JSON',
  parse: content => JSON.parse(content),
  stringify: value => JSON.stringify(value, null, 2),
};

export const yamlEncoding: Encoding = {
  id: 'yaml',
  label: 'YAML',
  parse: content => load(content),
  stringify: value => dump(value, { lineWidth: -1, noRefs: true }),
};

// JSON first: every JSON document is also valid YAML.
export const ENCODINGS: readonly Encoding[] = [jsonEncoding, yamlEncoding];

const canParse = (encoding: Encoding, content: string): boolean => {
  try {
    encoding.parse(content);
    return true;
  } catch {
    return false;
  }
};

/**
 * Detects the encoding of a document. Empty or unparseable content falls back
 * to JSON, so the JSON parse linter can report what is wrong with it.
 */
export const detectEncoding = (content: string): Encoding => {
  const stripped = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  if (stripped.trim() === '') {
    return jsonEncoding;
  }
  return ENCODINGS.find(encoding => canParse(encoding, stripped)) ?? jsonEncoding;
};

/**
 * Converts a document from one encoding to another. Throws when the content
 * cannot be parsed in the source encoding.
 */
export const convertContent = (from: Encoding, to: Encoding, content: string): string => {
  if (from.id === to.id) {
    return content;
  }
  return to.stringify(from.parse(content));
};

import { describe, expect, it } from 'vitest';
import { convertContent, detectEncoding, jsonEncoding, yamlEncoding } from './encodings';

describe('detectEncoding', () => {
  it('detects JSON', () => {
    expect(detectEncoding('{ "title": "Test" }').id).toBe('json');
  });

  it('detects YAML', () => {
    expect(detectEncoding('title: Test\n').id).toBe('yaml');
  });

  it('falls back to JSON for empty content', () => {
    expect(detectEncoding('  ').id).toBe('json');
  });

  it('falls back to JSON for content that is neither', () => {
    expect(detectEncoding('{ "title": ').id).toBe('json');
  });
});

describe('convertContent', () => {
  it('round-trips between JSON and YAML', () => {
    const json = JSON.stringify({ title: 'Test', resources: [{ name: 'repository' }] }, null, 2);
    const yaml = convertContent(jsonEncoding, yamlEncoding, json);
    expect(yaml).toBe('title: Test\nresources:\n  - name: repository\n');
    expect(convertContent(yamlEncoding, jsonEncoding, yaml)).toBe(json);
  });

  it('throws when the source cannot be parsed', () => {
    expect(() => convertContent(jsonEncoding, yamlEncoding, '{ "title": ')).toThrow();
  });
});

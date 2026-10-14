import { describe, expect, it } from 'vitest';
import { resolveYamlRange } from './schemaLinter';

const content = ['title: Test', 'contact:', '  name: Team', '  email: not-an-email', 'resources: []'].join('\n');

const highlighted = (pointer: string): string => {
  const { from, to } = resolveYamlRange(content, pointer);
  return content.slice(from, to);
};

describe('resolveYamlRange', () => {
  it('highlights a scalar value by its key line', () => {
    expect(highlighted('/contact/email')).toBe('  email: not-an-email');
  });

  it('highlights a mapping including its nested block', () => {
    expect(highlighted('/contact')).toBe('contact:\n  name: Team\n  email: not-an-email');
  });

  it('falls back to the deepest known parent', () => {
    expect(highlighted('/contact/url')).toBe('contact:\n  name: Team\n  email: not-an-email');
  });

  it('falls back to the first line for the document root', () => {
    expect(highlighted('')).toBe('title: Test');
  });
});

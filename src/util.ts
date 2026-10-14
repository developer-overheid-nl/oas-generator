import { Diagnostic } from '@codemirror/lint';

export const groupBy = <T>(arr: T[], key: (i: T) => string) =>
  arr.reduce(
    (groups, item) => {
      (groups[key(item)] ||= []).push(item);
      return groups;
    },
    {} as Record<string, T[]>,
  );

export const groupBySource = (diagnostics: Diagnostic[]) => groupBy(diagnostics, d => d.source ?? '');

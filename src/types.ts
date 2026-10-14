import { Extension } from '@uiw/react-codemirror';

export interface Spec {
  name: string;
  slug: string;
  example: string;
  linters: SpecLinter[];
}

export type SpecLinter = {
  name: string;
  linter: Extension;
};

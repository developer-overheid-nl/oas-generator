import { FC } from 'react';
import { Link } from 'react-router-dom';
import CodeEditor from './components/CodeEditor';
import GitHubIcon from './components/GitHubIcon';
import { Spec } from './types';

interface Props {
  spec: Spec;
}

const App: FC<Props> = ({ spec }) => {
  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between gap-4 px-4 py-2 bg-slate-700 text-white">
        <h1 className="min-w-0 truncate text-lg font-medium">
          <Link to="/">OAS Generator</Link>
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          <a href="https://github.com/developer-overheid-nl/oas-generator" target="_blank" className="ml-1 flex items-center">
            <GitHubIcon />
          </a>
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        <CodeEditor key={spec.slug} spec={spec} />
      </div>
    </div>
  );
};

export default App;

import clsx from 'clsx';
import { CSSProperties, FC } from 'react';
import { ENCODINGS, Encoding } from '../encodings';

interface Props {
  active: Encoding;
  onSwitch: (target: Encoding) => void;
  className?: string;
  style?: CSSProperties;
}

const FormatToggle: FC<Props> = ({ active, onSwitch, className, style }) => (
  <div
    role="radiogroup"
    aria-label="Format"
    style={style}
    className={clsx(
      'inline-flex rounded-md bg-white p-0.5 font-mono text-xs font-semibold tracking-wider uppercase shadow-sm ring-1 ring-slate-200',
      className,
    )}
  >
    {ENCODINGS.map(encoding => {
      const isActive = encoding.id === active.id;
      return (
        <button
          key={encoding.id}
          type="button"
          role="radio"
          aria-checked={isActive}
          onClick={() => !isActive && onSwitch(encoding)}
          className={clsx(
            'rounded px-2 py-0.5 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60',
            isActive ? 'bg-slate-100 text-slate-700 cursor-default' : 'bg-transparent text-slate-400 hover:text-slate-700 cursor-pointer',
          )}
        >
          {encoding.label}
        </button>
      );
    })}
  </div>
);

export default FormatToggle;

import { EditorView } from '@uiw/react-codemirror';
import { useEffect, useState } from 'react';

/**
 * Width the vertical scrollbar takes out of a CodeMirror scroller, in pixels
 * (0 with overlay scrollbars), so an overlay can stay clear of it. The
 * scroller's content box shrinks by exactly the scrollbar width when it
 * appears, which CodeMirror's own update cycle does not report.
 */
export const useScrollbarWidth = (view: EditorView | undefined): number => {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!view) {
      return;
    }
    const observer = new ResizeObserver(() => setWidth(view.scrollDOM.offsetWidth - view.scrollDOM.clientWidth));
    observer.observe(view.scrollDOM);
    return () => observer.disconnect();
  }, [view]);

  return width;
};

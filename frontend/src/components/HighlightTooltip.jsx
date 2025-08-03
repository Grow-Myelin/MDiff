import React, { useState } from 'react';
import { useFloating, autoUpdate, offset, flip, shift, useHover, useInteractions } from '@floating-ui/react';

function HighlightTooltip({ children, explanation, type }) {
  const [open, setOpen] = useState(false);
  
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'top',
    middleware: [
      offset(10),
      flip(),
      shift({ padding: 10 })
    ],
    whileElementsMounted: autoUpdate
  });

  const hover = useHover(context, {
    delay: { open: 300, close: 0 }
  });

  const { getReferenceProps, getFloatingProps } = useInteractions([hover]);

  return (
    <>
      <span
        ref={refs.setReference}
        {...getReferenceProps()}
      >
        {children}
      </span>
      {open && (
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          {...getFloatingProps()}
          className="z-50 max-w-xs"
        >
          <div className={`
            rounded-lg shadow-xl p-4 text-sm
            ${type === 'theme' 
              ? 'bg-blue-50 border border-blue-200 text-blue-900' 
              : 'bg-red-50 border border-red-200 text-red-900'
            }
          `}>
            <div className="font-semibold mb-1">
              {type === 'theme' ? 'Common Theme' : 'Contradiction'}
            </div>
            <div className="text-xs leading-relaxed">
              {explanation}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default HighlightTooltip;
import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import HighlightTooltip from './HighlightTooltip';
import { fuzzyMatcher } from '../services/fuzzyMatcher';

function MarkdownRenderer({ 
  content, 
  filename, 
  themes, 
  contradictions,
  onHighlightClick,
  activeHighlight
}) {
  const highlights = useMemo(() => {
    const foundHighlights = fuzzyMatcher.findHighlights(content, filename, themes, contradictions);
    console.log(`MarkdownRenderer for ${filename}: received ${foundHighlights.length} highlights`, {
      themes: foundHighlights.filter(h => h.type === 'theme').length,
      contradictions: foundHighlights.filter(h => h.type === 'contradiction').length
    });
    return foundHighlights;
  }, [content, filename, themes, contradictions]);

  const renderWithHighlights = (text, key) => {
    if (!highlights || highlights.length === 0) {
      return text;
    }

    // Sort highlights by start position
    const sortedHighlights = [...highlights].sort((a, b) => a.start - b.start);
    
    // Handle overlapping highlights by creating segments
    const segments = [];
    let currentIndex = 0;
    
    sortedHighlights.forEach((highlight, index) => {
      const start = Math.max(highlight.start, currentIndex);
      const end = highlight.end;
      
      // Add text before this highlight if there's a gap
      if (start > currentIndex) {
        segments.push({
          type: 'text',
          start: currentIndex,
          end: start,
          content: text.substring(currentIndex, start)
        });
      }
      
      // Only add this highlight if it doesn't completely overlap with previous content
      if (start < end) {
        const isActive = activeHighlight?.id === highlight.id;
        const highlightClass = highlight.type === 'theme' 
          ? 'highlight-common' 
          : 'highlight-contradiction';

        console.log(`Creating highlight segment: type=${highlight.type}, class=${highlightClass}, content="${text.substring(start, end).slice(0, 50)}..."`);

        segments.push({
          type: 'highlight',
          start: start,
          end: end,
          content: text.substring(start, end),
          highlight: highlight,
          highlightClass: highlightClass,
          isActive: isActive,
          key: `${key}-highlight-${index}`
        });
        
        currentIndex = Math.max(currentIndex, end);
      }
    });
    
    // Add remaining text
    if (currentIndex < text.length) {
      segments.push({
        type: 'text',
        start: currentIndex,
        end: text.length,
        content: text.substring(currentIndex)
      });
    }
    
    // Render segments
    return segments.map((segment, index) => {
      if (segment.type === 'text') {
        return segment.content;
      } else {
        return (
          <HighlightTooltip
            key={segment.key}
            explanation={segment.highlight.explanation}
            type={segment.highlight.type}
          >
            <mark
              data-highlight-id={segment.highlight.id}
              className={`${segment.highlightClass} ${segment.isActive ? 'ring-2 ring-offset-2 ring-verdant' : ''}`}
              onClick={() => onHighlightClick(segment.highlight.id, segment.highlight.targetFile, segment.highlight.targetPhrase)}
            >
              {segment.content}
            </mark>
          </HighlightTooltip>
        );
      }
    });
  };

  const components = {
    p: ({ children, ...props }) => (
      <p {...props}>
        {React.Children.map(children, (child, index) => {
          if (typeof child === 'string') {
            return renderWithHighlights(child, `p-${index}`);
          }
          return child;
        })}
      </p>
    ),
    li: ({ children, ...props }) => (
      <li {...props}>
        {React.Children.map(children, (child, index) => {
          if (typeof child === 'string') {
            return renderWithHighlights(child, `li-${index}`);
          }
          return child;
        })}
      </li>
    ),
    h1: ({ children, ...props }) => (
      <h1 {...props}>
        {React.Children.map(children, (child, index) => {
          if (typeof child === 'string') {
            return renderWithHighlights(child, `h1-${index}`);
          }
          return child;
        })}
      </h1>
    ),
    h2: ({ children, ...props }) => (
      <h2 {...props}>
        {React.Children.map(children, (child, index) => {
          if (typeof child === 'string') {
            return renderWithHighlights(child, `h2-${index}`);
          }
          return child;
        })}
      </h2>
    ),
    h3: ({ children, ...props }) => (
      <h3 {...props}>
        {React.Children.map(children, (child, index) => {
          if (typeof child === 'string') {
            return renderWithHighlights(child, `h3-${index}`);
          }
          return child;
        })}
      </h3>
    ),
    code: ({ inline, children, ...props }) => {
      if (inline) {
        return (
          <code {...props}>
            {React.Children.map(children, (child, index) => {
              if (typeof child === 'string') {
                return renderWithHighlights(child, `code-${index}`);
              }
              return child;
            })}
          </code>
        );
      }
      // Also highlight text in code blocks
      return (
        <code {...props}>
          {React.Children.map(children, (child, index) => {
            if (typeof child === 'string') {
              return renderWithHighlights(child, `codeblock-${index}`);
            }
            return child;
          })}
        </code>
      );
    },
    pre: ({ children, ...props }) => (
      <pre {...props}>
        {React.Children.map(children, (child, index) => {
          if (typeof child === 'string') {
            return renderWithHighlights(child, `pre-${index}`);
          }
          return child;
        })}
      </pre>
    ),
    blockquote: ({ children, ...props }) => (
      <blockquote {...props}>
        {React.Children.map(children, (child, index) => {
          if (typeof child === 'string') {
            return renderWithHighlights(child, `blockquote-${index}`);
          }
          return child;
        })}
      </blockquote>
    ),
    strong: ({ children, ...props }) => (
      <strong {...props}>
        {React.Children.map(children, (child, index) => {
          if (typeof child === 'string') {
            return renderWithHighlights(child, `strong-${index}`);
          }
          return child;
        })}
      </strong>
    ),
    em: ({ children, ...props }) => (
      <em {...props}>
        {React.Children.map(children, (child, index) => {
          if (typeof child === 'string') {
            return renderWithHighlights(child, `em-${index}`);
          }
          return child;
        })}
      </em>
    )
  };

  return (
    <div className="markdown-container">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default MarkdownRenderer;
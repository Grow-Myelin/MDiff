import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MarkdownRenderer from './MarkdownRenderer';
import { analyzeApi } from '../services/api';

function DiffViewer() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [analysisData, setAnalysisData] = useState(null);
  const [activeHighlight, setActiveHighlight] = useState(null);

  useEffect(() => {
    if (!sessionId) {
      navigate('/');
      return;
    }

    checkAnalysisStatus();
  }, [sessionId]);

  const checkAnalysisStatus = async () => {
    try {
      const statusInterval = setInterval(async () => {
        const status = await analyzeApi.getStatus(sessionId);
        
        if (status.status === 'completed') {
          clearInterval(statusInterval);
          const results = await analyzeApi.getResults(sessionId);
          setAnalysisData(results);
          setLoading(false);
        } else if (status.status === 'failed') {
          clearInterval(statusInterval);
          setError(status.error || 'Analysis failed');
          setLoading(false);
        } else if (status.status === 'processing') {
          setProgress(status.progress || 0);
        }
      }, 1000);

      return () => clearInterval(statusInterval);
    } catch (err) {
      setError(err.message || 'Failed to load analysis');
      setLoading(false);
    }
  };

  const handleHighlightClick = (highlightId, targetFile, targetPhrase) => {
    console.log(`Highlight clicked: ID=${highlightId}, targetFile=${targetFile}, targetPhrase=${targetPhrase}`);
    setActiveHighlight({ id: highlightId, targetFile });
    
    if (!targetFile) {
      console.log('No target file specified for this highlight');
      return;
    }
    
    // First try to find by highlight ID
    let targetElement = document.querySelector(
      `[data-file="${targetFile}"] [data-highlight-id="${highlightId}"]`
    );
    console.log(`Looking for element: [data-file="${targetFile}"] [data-highlight-id="${highlightId}"]`);
    
    // If not found, try to find by searching for the target phrase
    if (!targetElement && targetPhrase) {
      console.log(`Element not found by ID, searching for phrase: "${targetPhrase}"`);
      const fileContainer = document.querySelector(`[data-file="${targetFile}"]`);
      if (fileContainer) {
        console.log(`File container found for ${targetFile}`);
        
        // Look for any highlight that contains the target phrase
        const allHighlights = fileContainer.querySelectorAll('[data-highlight-id]');
        for (const highlight of allHighlights) {
          if (highlight.textContent.toLowerCase().includes(targetPhrase.toLowerCase().substring(0, 15))) {
            targetElement = highlight;
            console.log(`Found matching highlight by text content`);
            break;
          }
        }
        
        // If still not found, try tree walker
        if (!targetElement) {
          const walker = document.createTreeWalker(
            fileContainer,
            NodeFilter.SHOW_TEXT,
            null,
            false
          );
          
          let node;
          while (node = walker.nextNode()) {
            if (node.textContent.toLowerCase().includes(targetPhrase.toLowerCase().substring(0, 15))) {
              targetElement = node.parentElement;
              console.log(`Found element via tree walker`);
              break;
            }
          }
        }
      } else {
        console.log(`File container not found for ${targetFile}`);
      }
    }
    
    if (targetElement) {
      console.log(`Scrolling to target element`);
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Highlight the target temporarily
      targetElement.style.outline = '2px solid #fbbf24';
      setTimeout(() => {
        targetElement.style.outline = '';
      }, 2000);
    } else {
      console.log(`Target element not found for targetFile=${targetFile}, targetPhrase=${targetPhrase}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center">
          <div className="loading-spinner w-16 h-16 mb-4"></div>
          <p className="text-xl text-verdant-dark mb-2">Analyzing your files...</p>
          <div className="w-64 bg-cream-dark rounded-full h-3 overflow-hidden">
            <div 
              className="bg-verdant h-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-sm text-coffee mt-2">{progress}% complete</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="card max-w-md">
          <div className="text-center">
            <svg
              className="mx-auto h-16 w-16 text-red-500 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h2 className="text-2xl font-semibold text-verdant mb-2">Analysis Error</h2>
            <p className="text-coffee mb-6">{error}</p>
            <button onClick={() => navigate('/')} className="btn-primary">
              Back to Upload
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!analysisData || !analysisData.files || analysisData.files.length === 0) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-verdant-dark">No analysis data available</p>
          <button onClick={() => navigate('/')} className="btn-primary mt-4">
            Back to Upload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-cream-light border-b border-coffee/20 sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-verdant">Markdown Diff Analysis</h1>
            <button
              onClick={() => navigate('/')}
              className="text-coffee hover:text-coffee-dark transition-colors"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div className="mt-2 flex items-center space-x-6 text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-blue-400 rounded"></div>
              <span className="text-verdant-dark">
                Common Themes ({analysisData.common_themes?.length || 0})
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-red-400 rounded"></div>
              <span className="text-verdant-dark">
                Contradictions ({analysisData.contradictions?.length || 0})
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className={`flex h-[calc(100vh-120px)] ${
        analysisData.files.length === 1 ? '' : 'divide-x divide-coffee/20'
      }`}>
        {console.log(`Total files to render: ${analysisData.files.length}`, analysisData.files)}
        {analysisData.files.map((file, index) => {
          console.log(`Rendering file ${index + 1}: ${file.filename} (${file.originalName})`);
          return (
          <div
            key={file.filename}
            data-file={file.filename}
            className="flex-1 overflow-y-auto"
          >
            <div className="sticky top-0 bg-cream-light border-b border-coffee/20 px-4 py-2 z-[5]">
              <h2 className="font-semibold text-verdant">{file.originalName || file.filename}</h2>
            </div>
            <div className="p-6">
              <MarkdownRenderer
                content={file.content}
                filename={file.filename}
                themes={analysisData.common_themes}
                contradictions={analysisData.contradictions}
                onHighlightClick={handleHighlightClick}
                activeHighlight={activeHighlight}
              />
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

export default DiffViewer;
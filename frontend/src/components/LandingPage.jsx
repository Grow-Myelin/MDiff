import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import FileUploader from './FileUploader';

function LandingPage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const onDrop = useCallback((acceptedFiles) => {
    setError('');
    const mdFiles = acceptedFiles.filter(file => file.name.endsWith('.md'));
    
    if (mdFiles.length === 0) {
      setError('Please upload only Markdown (.md) files');
      return;
    }
    
    if (mdFiles.length < 2) {
      setError('Please upload at least 2 Markdown files to compare');
      return;
    }
    
    setFiles(mdFiles);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/markdown': ['.md']
    },
    multiple: true
  });

  const handleUpload = async () => {
    if (files.length < 2) {
      setError('Please upload at least 2 Markdown files to compare');
      return;
    }

    setUploading(true);
    setError('');

    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });

    try {
      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!uploadResponse.ok) {
        throw new Error('Upload failed');
      }

      const uploadData = await uploadResponse.json();
      const { sessionId } = uploadData;

      const analyzeResponse = await fetch(`/api/analyze/${sessionId}`, {
        method: 'POST'
      });

      if (!analyzeResponse.ok) {
        throw new Error('Analysis start failed');
      }

      navigate(`/diff/${sessionId}`);
    } catch (err) {
      setError(err.message || 'An error occurred during upload');
      setUploading(false);
    }
  };

  const removeFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream to-cream-dark flex items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-verdant mb-4">
            Markdown Diff Analyzer
          </h1>
          <p className="text-xl text-verdant-dark/80">
            Upload your markdown files to discover semantic similarities and contradictions
          </p>
        </div>

        <div className="card">
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-all duration-200 cursor-pointer
              ${isDragActive 
                ? 'border-verdant bg-verdant/5' 
                : 'border-coffee/30 hover:border-coffee hover:bg-coffee/5'
              }`}
          >
            <input {...getInputProps()} />
            <svg
              className="mx-auto h-16 w-16 text-coffee mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-verdant-dark text-lg mb-2">
              {isDragActive
                ? 'Drop the files here...'
                : 'Drag & drop markdown files here, or click to select'}
            </p>
            <p className="text-coffee text-sm">
              Upload at least 2 .md files to compare
            </p>
          </div>

          {files.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-verdant mb-3">
                Selected Files ({files.length})
              </h3>
              <div className="space-y-2">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-cream-dark/50 p-3 rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <svg
                        className="h-5 w-5 text-coffee"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <span className="text-verdant-dark">{file.name}</span>
                      <span className="text-coffee text-sm">
                        ({(file.size / 1024).toFixed(2)} KB)
                      </span>
                    </div>
                    <button
                      onClick={() => removeFile(index)}
                      className="text-coffee hover:text-coffee-dark transition-colors"
                    >
                      <svg
                        className="h-5 w-5"
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
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-100 border border-red-300 rounded-lg">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          <div className="mt-8 flex justify-center">
            <button
              onClick={handleUpload}
              disabled={files.length < 2 || uploading}
              className={`btn-primary flex items-center space-x-2
                ${(files.length < 2 || uploading) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {uploading ? (
                <>
                  <div className="loading-spinner w-5 h-5"></div>
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>Analyze Files</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LandingPage;
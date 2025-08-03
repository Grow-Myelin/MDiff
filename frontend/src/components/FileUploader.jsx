import React from 'react';

function FileUploader({ files, onFilesChange }) {
  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    const mdFiles = selectedFiles.filter(file => file.name.endsWith('.md'));
    onFilesChange(mdFiles);
  };

  return (
    <div className="file-uploader">
      <input
        type="file"
        multiple
        accept=".md"
        onChange={handleFileChange}
        className="hidden"
        id="file-input"
      />
      <label
        htmlFor="file-input"
        className="btn-secondary cursor-pointer inline-block"
      >
        Select Markdown Files
      </label>
      {files.length > 0 && (
        <p className="mt-2 text-sm text-verdant-dark">
          {files.length} file(s) selected
        </p>
      )}
    </div>
  );
}

export default FileUploader;
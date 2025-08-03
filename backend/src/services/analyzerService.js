const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const analysisStatus = new Map();
const analysisResults = new Map();

async function analyzeFiles(sessionDir, sessionId) {
  analysisStatus.set(sessionId, {
    status: 'processing',
    startTime: new Date().toISOString(),
    progress: 0
  });

  return new Promise((resolve, reject) => {
    const analyzerPath = path.join(__dirname, '../../../analyzer.js');
    
    const analyzerProcess = spawn('node', [analyzerPath], {
      cwd: sessionDir,
      env: { 
        ...process.env,
        CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY
      }
    });

    let stdout = '';
    let stderr = '';

    analyzerProcess.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log(`Analyzer stdout: ${data}`);
      
      const progressMatch = data.toString().match(/Pass (\d+)\/(\d+)/);
      if (progressMatch) {
        const current = parseInt(progressMatch[1]);
        const total = parseInt(progressMatch[2]);
        const progress = (current / total) * 100;
        
        analysisStatus.set(sessionId, {
          ...analysisStatus.get(sessionId),
          progress: Math.round(progress)
        });
      }
    });

    analyzerProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(`Analyzer stderr: ${data}`);
    });

    analyzerProcess.on('close', (code) => {
      if (code !== 0) {
        analysisStatus.set(sessionId, {
          status: 'failed',
          error: stderr || 'Analysis process failed',
          completedTime: new Date().toISOString()
        });
        reject(new Error(`Analyzer process exited with code ${code}`));
        return;
      }

      try {
        const resultsPath = path.join(sessionDir, 'ai_file_analysis_complete.json');
        if (fs.existsSync(resultsPath)) {
          const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
          
          // Read filename mapping if it exists
          let filenameMapping = {};
          const mappingPath = path.join(sessionDir, 'filename_mapping.json');
          if (fs.existsSync(mappingPath)) {
            filenameMapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
          }

          const files = fs.readdirSync(sessionDir)
            .filter(f => f.endsWith('.md'))
            .map(f => {
              const content = fs.readFileSync(path.join(sessionDir, f), 'utf-8');
              const originalName = filenameMapping[f] || f;
              return { 
                filename: f,           // Generated filename for analysis matching
                originalName: originalName,  // Original uploaded filename
                content 
              };
            });

          // Also include any files referenced in the analysis but not in the current directory
          const referencedFiles = new Set();
          if (results.common_themes) {
            results.common_themes.forEach(theme => {
              theme.instances.forEach(instance => {
                referencedFiles.add(instance.source_file);
                instance.target_files.forEach(target => {
                  referencedFiles.add(target.target_file);
                });
              });
            });
          }
          if (results.contradictions) {
            results.contradictions.forEach(contradiction => {
              contradiction.instances.forEach(instance => {
                referencedFiles.add(instance.source_file);
                instance.target_files.forEach(target => {
                  referencedFiles.add(target.target_file);
                });
              });
            });
          }

          // Check if there are referenced files missing from our files array
          const existingFilenames = new Set(files.map(f => f.filename));
          const missingFiles = [...referencedFiles].filter(f => !existingFilenames.has(f));
          
          if (missingFiles.length > 0) {
            console.log(`Warning: Analysis references ${missingFiles.length} files not found in session directory:`, missingFiles);
            // Try to find these files in adjacent session directories or uploads directory
            const uploadsDir = path.dirname(sessionDir);
            const allSessionDirs = fs.readdirSync(uploadsDir).filter(d => {
              const dirPath = path.join(uploadsDir, d);
              return fs.statSync(dirPath).isDirectory();
            });
            
            missingFiles.forEach(missingFile => {
              for (const otherSessionDir of allSessionDirs) {
                const otherSessionPath = path.join(uploadsDir, otherSessionDir);
                const missingFilePath = path.join(otherSessionPath, missingFile);
                if (fs.existsSync(missingFilePath)) {
                  console.log(`Found missing file ${missingFile} in session ${otherSessionDir}`);
                  const content = fs.readFileSync(missingFilePath, 'utf-8');
                  const originalName = filenameMapping[missingFile] || missingFile;
                  files.push({
                    filename: missingFile,
                    originalName: originalName,
                    content
                  });
                  break;
                }
              }
            });
          }

          analysisResults.set(sessionId, {
            ...results,
            files: files
          });
          
          analysisStatus.set(sessionId, {
            status: 'completed',
            completedTime: new Date().toISOString(),
            progress: 100
          });
          
          resolve(results);
        } else {
          throw new Error('Analysis results file not found');
        }
      } catch (error) {
        analysisStatus.set(sessionId, {
          status: 'failed',
          error: error.message,
          completedTime: new Date().toISOString()
        });
        reject(error);
      }
    });

    analyzerProcess.on('error', (error) => {
      analysisStatus.set(sessionId, {
        status: 'failed',
        error: error.message,
        completedTime: new Date().toISOString()
      });
      reject(error);
    });
  });
}

async function getAnalysisStatus(sessionId) {
  return analysisStatus.get(sessionId) || { status: 'not_found' };
}

async function getAnalysisResults(sessionId) {
  return analysisResults.get(sessionId) || null;
}

setTimeout(() => {
  const now = Date.now();
  for (const [sessionId, status] of analysisStatus.entries()) {
    const completedTime = new Date(status.completedTime || status.startTime).getTime();
    if (now - completedTime > 3600000) { // 1 hour
      analysisStatus.delete(sessionId);
      analysisResults.delete(sessionId);
    }
  }
}, 600000); // Run every 10 minutes

module.exports = {
  analyzeFiles,
  getAnalysisStatus,
  getAnalysisResults
};
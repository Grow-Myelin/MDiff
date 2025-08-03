const express = require('express');
const path = require('path');
const analyzerService = require('../services/analyzerService');

const router = express.Router();

router.post('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const sessionDir = path.join(__dirname, '../../uploads', sessionId);
    
    res.json({
      message: 'Analysis started',
      sessionId: sessionId
    });

    analyzerService.analyzeFiles(sessionDir, sessionId)
      .then(result => {
        console.log(`Analysis completed for session ${sessionId}`);
      })
      .catch(error => {
        console.error(`Analysis failed for session ${sessionId}:`, error);
      });

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Failed to start analysis' });
  }
});

router.get('/:sessionId/status', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const status = await analyzerService.getAnalysisStatus(sessionId);
    
    res.json(status);
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to check analysis status' });
  }
});

router.get('/:sessionId/results', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const results = await analyzerService.getAnalysisResults(sessionId);
    
    if (!results) {
      return res.status(404).json({ error: 'Results not found' });
    }
    
    res.json(results);
  } catch (error) {
    console.error('Results retrieval error:', error);
    res.status(500).json({ error: 'Failed to retrieve results' });
  }
});

module.exports = router;
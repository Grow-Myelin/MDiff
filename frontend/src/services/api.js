import axios from 'axios';

const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const uploadApi = {
  uploadFiles: async (formData) => {
    const response = await api.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};

export const analyzeApi = {
  startAnalysis: async (sessionId) => {
    const response = await api.post(`/analyze/${sessionId}`);
    return response.data;
  },

  getStatus: async (sessionId) => {
    const response = await api.get(`/analyze/${sessionId}/status`);
    return response.data;
  },

  getResults: async (sessionId) => {
    const response = await api.get(`/analyze/${sessionId}/results`);
    return response.data;
  },
};

export default api;
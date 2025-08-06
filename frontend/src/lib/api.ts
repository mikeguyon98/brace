import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add any auth headers here if needed
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error)
    return Promise.reject(error)
  }
)

export interface SimulatorConfig {
  clearinghouse: {
    database: {
      host: string
      port: number
      database: string
      username: string
      password: string
    }
  }
  billing: {
    database: {
      host: string
      port: number
      database: string
      username: string
      password: string
    }
    reportingIntervalSeconds: number
  }
  payers: Array<{
    payer_id: string
    name: string
    processing_delay_ms: {
      min: number
      max: number
    }
    adjudication_rules: {
      payer_percentage: number
      copay_fixed_amount: number
      deductible_percentage: number
    }
    denial_settings?: {
      denial_rate: number
      hard_denial_rate: number
      preferred_categories: string[]
    }
  }>
  ingestion: {
    rateLimit: number
  }
}

export interface PresetConfig {
  name: string
  displayName: string
  description: string
  config: SimulatorConfig
}

export interface ProcessingStatus {
  isRunning: boolean
  currentFile: string
  progress: number
  totalClaims: number
  processedClaims: number
  startTime: string | null
  estimatedCompletion: string | null
}

export interface SimulatorStats {
  isRunning: boolean
  queues: {
    totalQueues: number
    totalPending: number
    totalProcessing: number
  }
  ingestion: {
    filesProcessed: number
    claimsProcessed: number
    errors: number
  }
  clearinghouse: {
    claimsProcessed: number
    claimsRouted: number
    errors: number
  }
  billing: {
    totalClaims: number
    totalBilledAmount: number
    totalPaidAmount: number
    totalPatientResponsibility: number
    payerBreakdown: Map<string, { billedAmount: number; paidAmount: number }>
  }
  payers: Array<{
    payerId: string
    payerName: string
    claimsProcessed: number
    deniedClaims: number
    averageProcessingTime: number
    errors: number
  }>
  aging: Array<{
    payerId: string
    payerName: string
    bucket0To1Min: number
    bucket1To2Min: number
    bucket2To3Min: number
    bucket3PlusMin: number
    outstandingClaims: number
    avgAgeMinutes: number
    oldestClaimMinutes: number
    outstandingAmount: number
  }>
}

export const apiClient = {
  // Health check
  health: () => api.get('/health'),

  // Configuration
  getDefaultConfig: () => api.get<SimulatorConfig>('/config/default'),
  getPresets: () => api.get<PresetConfig[]>('/config/presets'),
  validateConfig: (config: SimulatorConfig) => 
    api.post('/config/validate', config),

  // Simulator control
  startSimulator: (config?: SimulatorConfig) => 
    api.post('/simulator/start', { config }),
  stopSimulator: () => api.post('/simulator/stop'),
  getStatus: () => api.get<{
    isRunning: boolean
    status: ProcessingStatus
    stats: SimulatorStats
  }>('/simulator/status'),

  // File processing
  uploadFile: (file: File) => {
    const formData = new FormData()
    formData.append('claimsFile', file)
    return api.post('/simulator/process', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  // Results
  getResults: () => api.get<{
    stats: SimulatorStats
    processingStatus: ProcessingStatus
    timestamp: string
  }>('/simulator/results'),

  // System info
  getSystemInfo: () => api.get<{
    cpuCores: number
    workerThreads: number
    memoryUsage: any
    uptime: number
    platform: string
    nodeVersion: string
  }>('/system/info'),
}

export default api 
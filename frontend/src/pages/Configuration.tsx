import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { Play, Settings, Save, CheckCircle, AlertCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { apiClient, SimulatorConfig, PresetConfig } from '../lib/api'
import { ConfigurationForm } from '../components/ConfigurationForm'

export function Configuration() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedConfig, setSelectedConfig] = useState<SimulatorConfig | null>(null)
  const [isValid, setIsValid] = useState(false)

  // Fetch available presets and default config
  const { data: presets, isLoading: presetsLoading } = useQuery(
    'presets',
    () => apiClient.getPresets(),
    {
      staleTime: 5 * 60 * 1000,
    }
  )

  const { data: defaultConfig, isLoading: defaultLoading } = useQuery(
    'default-config',
    () => apiClient.getDefaultConfig(),
    {
      staleTime: 5 * 60 * 1000,
    }
  )

  // Mutations
  const startSimulatorMutation = useMutation(
    (config: SimulatorConfig) => apiClient.startSimulator(config),
    {
      onSuccess: () => {
        toast.success('Simulator started successfully!')
        queryClient.invalidateQueries('simulator-status')
        navigate('/processing')
      },
      onError: (error: any) => {
        toast.error(`Failed to start simulator: ${error.response?.data?.error || error.message}`)
      },
    }
  )

  const validateConfigMutation = useMutation(
    (config: SimulatorConfig) => apiClient.validateConfig(config),
    {
      onSuccess: (response) => {
        setIsValid(response.data.valid)
        if (response.data.valid) {
          toast.success('Configuration is valid!')
        } else {
          toast.error('Configuration validation failed')
        }
      },
      onError: (error: any) => {
        setIsValid(false)
        toast.error(`Validation error: ${error.response?.data?.message || error.message}`)
      },
    }
  )

  const handleConfigChange = (config: SimulatorConfig) => {
    setSelectedConfig(config)
    // Auto-validate when config changes
    validateConfigMutation.mutate(config)
  }

  const handleStartSimulator = () => {
    if (!selectedConfig) {
      toast.error('Please select or configure a configuration first')
      return
    }
    
    if (!isValid) {
      toast.error('Please fix configuration errors before starting')
      return
    }

    startSimulatorMutation.mutate(selectedConfig)
  }

  const handlePresetSelect = (preset: PresetConfig) => {
    setSelectedConfig(preset.config)
    validateConfigMutation.mutate(preset.config)
    toast.success(`Selected ${preset.displayName} configuration`)
  }

  const isLoading = presetsLoading || defaultLoading

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Configuration</h1>
          <p className="text-gray-600 mt-1">
            Configure your billing simulator settings and payers
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {isValid && (
            <div className="flex items-center space-x-2 text-success-600">
              <CheckCircle className="h-5 w-5" />
              <span className="text-sm font-medium">Valid Configuration</span>
            </div>
          )}
          <button
            onClick={handleStartSimulator}
            disabled={!selectedConfig || !isValid || startSimulatorMutation.isLoading}
            className="btn btn-primary btn-lg"
          >
            {startSimulatorMutation.isLoading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
            ) : (
              <Play className="h-5 w-5 mr-2" />
            )}
            Start Simulator
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration Presets */}
        <div className="lg:col-span-1">
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Start Presets</h2>
            
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-16 bg-gray-200 rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {presets?.data?.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => handlePresetSelect(preset)}
                    className="w-full text-left p-3 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-colors"
                  >
                    <h3 className="font-medium text-gray-900">{preset.displayName}</h3>
                    <p className="text-sm text-gray-600 mt-1">{preset.description}</p>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Default Configuration</h3>
              <button
                onClick={() => defaultConfig?.data && handlePresetSelect({
                  name: 'default',
                  displayName: 'Default',
                  description: 'Default configuration for basic testing',
                  config: defaultConfig.data
                })}
                className="w-full text-left p-3 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-colors"
              >
                <h3 className="font-medium text-gray-900">Default</h3>
                <p className="text-sm text-gray-600 mt-1">Basic configuration for testing</p>
              </button>
            </div>
          </div>
        </div>

        {/* Configuration Form */}
        <div className="lg:col-span-2">
          <div className="card p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Configuration Details</h2>
              <div className="flex items-center space-x-2">
                {validateConfigMutation.isLoading && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600" />
                )}
                {!isValid && selectedConfig && (
                  <div className="flex items-center space-x-1 text-danger-600">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm">Invalid</span>
                  </div>
                )}
              </div>
            </div>

            {selectedConfig ? (
              <ConfigurationForm
                config={selectedConfig}
                onChange={handleConfigChange}
                onValidate={() => selectedConfig && validateConfigMutation.mutate(selectedConfig)}
                isValidating={validateConfigMutation.isLoading}
              />
            ) : (
              <div className="text-center py-12">
                <Settings className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Configuration Selected</h3>
                <p className="text-gray-600">
                  Choose a preset from the left or start with the default configuration
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
} 
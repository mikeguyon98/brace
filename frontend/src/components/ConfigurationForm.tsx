import { useState } from 'react'
import { Plus, Trash2, Save } from 'lucide-react'
import { SimulatorConfig } from '../lib/api'

interface ConfigurationFormProps {
  config: SimulatorConfig
  onChange: (config: SimulatorConfig) => void
  onValidate: () => void
  isValidating: boolean
}

export function ConfigurationForm({ 
  config, 
  onChange, 
  onValidate, 
  isValidating 
}: ConfigurationFormProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'payers' | 'databases'>('general')

  const updateConfig = (updates: Partial<SimulatorConfig>) => {
    onChange({ ...config, ...updates })
  }

  const updatePayer = (index: number, updates: Partial<SimulatorConfig['payers'][0]>) => {
    const newPayers = [...config.payers]
    newPayers[index] = { ...newPayers[index], ...updates }
    updateConfig({ payers: newPayers })
  }

  const addPayer = () => {
    const newPayer: SimulatorConfig['payers'][0] = {
      payer_id: `payer_${config.payers.length + 1}`,
      name: `New Payer ${config.payers.length + 1}`,
      processing_delay_ms: { min: 1000, max: 3000 },
      adjudication_rules: {
        payer_percentage: 0.80,
        copay_fixed_amount: 25.00,
        deductible_percentage: 0.10,
      },
      denial_settings: {
        denial_rate: 0.10,
        hard_denial_rate: 0.75,
        preferred_categories: ['AUTHORIZATION', 'MEDICAL_NECESSITY']
      }
    }
    updateConfig({ payers: [...config.payers, newPayer] })
  }

  const removePayer = (index: number) => {
    const newPayers = config.payers.filter((_, i) => i !== index)
    updateConfig({ payers: newPayers })
  }

  const tabs = [
    { id: 'general', name: 'General Settings' },
    { id: 'payers', name: 'Payers' },
    { id: 'databases', name: 'Databases' },
  ]

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Ingestion Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Rate Limit (claims/second)</label>
                <input
                  type="number"
                  value={config.ingestion.rateLimit}
                  onChange={(e) => updateConfig({ 
                    ingestion: { ...config.ingestion, rateLimit: parseFloat(e.target.value) }
                  })}
                  className="input"
                  min="0.1"
                  max="100"
                  step="0.1"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Billing Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Reporting Interval (seconds)</label>
                <input
                  type="number"
                  value={config.billing.reportingIntervalSeconds}
                  onChange={(e) => updateConfig({ 
                    billing: { ...config.billing, reportingIntervalSeconds: parseInt(e.target.value) }
                  })}
                  className="input"
                  min="5"
                  max="300"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'payers' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Payer Configuration</h3>
            <button
              onClick={addPayer}
              className="btn btn-primary btn-sm"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Payer
            </button>
          </div>

          <div className="space-y-6">
            {config.payers.map((payer, index) => (
              <div key={index} className="card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-md font-medium text-gray-900">Payer {index + 1}</h4>
                  <button
                    onClick={() => removePayer(index)}
                    className="text-danger-600 hover:text-danger-700"
                    disabled={config.payers.length <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Payer ID</label>
                    <input
                      type="text"
                      value={payer.payer_id}
                      onChange={(e) => updatePayer(index, { payer_id: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Name</label>
                    <input
                      type="text"
                      value={payer.name}
                      onChange={(e) => updatePayer(index, { name: e.target.value })}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Min Processing Delay (ms)</label>
                    <input
                      type="number"
                      value={payer.processing_delay_ms.min}
                      onChange={(e) => updatePayer(index, { 
                        processing_delay_ms: { 
                          ...payer.processing_delay_ms, 
                          min: parseInt(e.target.value) 
                        }
                      })}
                      className="input"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="label">Max Processing Delay (ms)</label>
                    <input
                      type="number"
                      value={payer.processing_delay_ms.max}
                      onChange={(e) => updatePayer(index, { 
                        processing_delay_ms: { 
                          ...payer.processing_delay_ms, 
                          max: parseInt(e.target.value) 
                        }
                      })}
                      className="input"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="label">Payer Percentage</label>
                    <input
                      type="number"
                      value={payer.adjudication_rules.payer_percentage}
                      onChange={(e) => updatePayer(index, { 
                        adjudication_rules: { 
                          ...payer.adjudication_rules, 
                          payer_percentage: parseFloat(e.target.value) 
                        }
                      })}
                      className="input"
                      min="0"
                      max="1"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="label">Copay Amount ($)</label>
                    <input
                      type="number"
                      value={payer.adjudication_rules.copay_fixed_amount}
                      onChange={(e) => updatePayer(index, { 
                        adjudication_rules: { 
                          ...payer.adjudication_rules, 
                          copay_fixed_amount: parseFloat(e.target.value) 
                        }
                      })}
                      className="input"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="label">Deductible Percentage</label>
                    <input
                      type="number"
                      value={payer.adjudication_rules.deductible_percentage}
                      onChange={(e) => updatePayer(index, { 
                        adjudication_rules: { 
                          ...payer.adjudication_rules, 
                          deductible_percentage: parseFloat(e.target.value) 
                        }
                      })}
                      className="input"
                      min="0"
                      max="1"
                      step="0.01"
                    />
                  </div>
                </div>

                {/* Denial Settings */}
                {payer.denial_settings && (
                  <div className="mt-6 pt-6 border-t border-gray-200">
                    <h5 className="text-sm font-medium text-gray-900 mb-3">Denial Settings</h5>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="label">Denial Rate</label>
                        <input
                          type="number"
                          value={payer.denial_settings.denial_rate}
                          onChange={(e) => updatePayer(index, { 
                            denial_settings: { 
                              ...payer.denial_settings!, 
                              denial_rate: parseFloat(e.target.value) 
                            }
                          })}
                          className="input"
                          min="0"
                          max="1"
                          step="0.01"
                        />
                      </div>
                      <div>
                        <label className="label">Hard Denial Rate</label>
                        <input
                          type="number"
                          value={payer.denial_settings.hard_denial_rate}
                          onChange={(e) => updatePayer(index, { 
                            denial_settings: { 
                              ...payer.denial_settings!, 
                              hard_denial_rate: parseFloat(e.target.value) 
                            }
                          })}
                          className="input"
                          min="0"
                          max="1"
                          step="0.01"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'databases' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Clearinghouse Database</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Host</label>
                <input
                  type="text"
                  value={config.clearinghouse.database.host}
                  onChange={(e) => updateConfig({ 
                    clearinghouse: { 
                      ...config.clearinghouse, 
                      database: { ...config.clearinghouse.database, host: e.target.value }
                    }
                  })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Port</label>
                <input
                  type="number"
                  value={config.clearinghouse.database.port}
                  onChange={(e) => updateConfig({ 
                    clearinghouse: { 
                      ...config.clearinghouse, 
                      database: { ...config.clearinghouse.database, port: parseInt(e.target.value) }
                    }
                  })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Database</label>
                <input
                  type="text"
                  value={config.clearinghouse.database.database}
                  onChange={(e) => updateConfig({ 
                    clearinghouse: { 
                      ...config.clearinghouse, 
                      database: { ...config.clearinghouse.database, database: e.target.value }
                    }
                  })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Username</label>
                <input
                  type="text"
                  value={config.clearinghouse.database.username}
                  onChange={(e) => updateConfig({ 
                    clearinghouse: { 
                      ...config.clearinghouse, 
                      database: { ...config.clearinghouse.database, username: e.target.value }
                    }
                  })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Password</label>
                <input
                  type="password"
                  value={config.clearinghouse.database.password}
                  onChange={(e) => updateConfig({ 
                    clearinghouse: { 
                      ...config.clearinghouse, 
                      database: { ...config.clearinghouse.database, password: e.target.value }
                    }
                  })}
                  className="input"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Billing Database</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Host</label>
                <input
                  type="text"
                  value={config.billing.database.host}
                  onChange={(e) => updateConfig({ 
                    billing: { 
                      ...config.billing, 
                      database: { ...config.billing.database, host: e.target.value }
                    }
                  })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Port</label>
                <input
                  type="number"
                  value={config.billing.database.port}
                  onChange={(e) => updateConfig({ 
                    billing: { 
                      ...config.billing, 
                      database: { ...config.billing.database, port: parseInt(e.target.value) }
                    }
                  })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Database</label>
                <input
                  type="text"
                  value={config.billing.database.database}
                  onChange={(e) => updateConfig({ 
                    billing: { 
                      ...config.billing, 
                      database: { ...config.billing.database, database: e.target.value }
                    }
                  })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Username</label>
                <input
                  type="text"
                  value={config.billing.database.username}
                  onChange={(e) => updateConfig({ 
                    billing: { 
                      ...config.billing, 
                      database: { ...config.billing.database, username: e.target.value }
                    }
                  })}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Password</label>
                <input
                  type="password"
                  value={config.billing.database.password}
                  onChange={(e) => updateConfig({ 
                    billing: { 
                      ...config.billing, 
                      database: { ...config.billing.database, password: e.target.value }
                    }
                  })}
                  className="input"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end space-x-3 pt-6 border-t border-gray-200">
        <button
          onClick={onValidate}
          disabled={isValidating}
          className="btn btn-secondary"
        >
          {isValidating ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Validate Configuration
        </button>
      </div>
    </div>
  )
} 
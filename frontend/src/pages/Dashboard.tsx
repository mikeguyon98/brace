import React from 'react'
import { useQuery } from 'react-query'
import { Activity, Play, Settings, BarChart3, Upload, Database, Cpu, HardDrive } from 'lucide-react'
import { Link } from 'react-router-dom'
import { apiClient } from '../lib/api'
import { StatusCard } from '../components/StatusCard'
import { QuickActionCard } from '../components/QuickActionCard'

export function Dashboard() {
  const { data: status, isLoading } = useQuery(
    'simulator-status',
    () => apiClient.getStatus(),
    {
      refetchInterval: 5000, // Poll every 5 seconds
      refetchIntervalInBackground: true,
    }
  )

  const { data: presets } = useQuery(
    'presets',
    () => apiClient.getPresets(),
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  )

  const { data: systemInfo } = useQuery(
    'system-info',
    () => apiClient.getSystemInfo(),
    {
      refetchInterval: 10000, // Poll every 10 seconds
      refetchIntervalInBackground: true,
    }
  )

  const isRunning = status?.data?.isRunning || false
  const stats = status?.data?.stats

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Monitor and control your healthcare billing simulator
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium ${
            isRunning 
              ? 'bg-success-100 text-success-800' 
              : 'bg-gray-100 text-gray-800'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              isRunning ? 'bg-success-500' : 'bg-gray-400'
            }`} />
            {isRunning ? 'Running' : 'Stopped'}
          </div>
        </div>
      </div>

      {/* System Information */}
      {systemInfo && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">System Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded">
              <Cpu className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">{systemInfo.data?.cpuCores || 0} CPU Cores</p>
                <p className="text-xs text-gray-600">Available</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded">
              <Activity className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">{systemInfo.data?.workerThreads || 0} Worker Threads</p>
                <p className="text-xs text-gray-600">Active</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded">
              <HardDrive className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {systemInfo.data?.memoryUsage?.heapUsed ? 
                    Math.round(systemInfo.data.memoryUsage.heapUsed / 1024 / 1024) : 0} MB
                </p>
                <p className="text-xs text-gray-600">Memory Used</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded">
              <Settings className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">{systemInfo.data?.platform || 'Unknown'}</p>
                <p className="text-xs text-gray-600">Platform</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatusCard
          title="Total Claims"
          value={stats?.billing?.totalClaims?.toLocaleString() || '0'}
          icon={Database}
          loading={isLoading}
        />
        <StatusCard
          title="Amount Billed"
          value={`$${stats?.billing?.totalBilledAmount?.toLocaleString() || '0'}`}
          icon={BarChart3}
          loading={isLoading}
        />
        <StatusCard
          title="Amount Paid"
          value={`$${stats?.billing?.totalPaidAmount?.toLocaleString() || '0'}`}
          icon={Activity}
          loading={isLoading}
        />
        <StatusCard
          title="Payment Rate"
          value={`${stats?.billing?.paymentRate?.toFixed(1) || '0'}%`}
          icon={BarChart3}
          loading={isLoading}
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <QuickActionCard
          title="Start Simulator"
          description="Launch the billing simulator with your configuration"
          icon={Play}
          href="/configuration"
          variant="primary"
          disabled={isRunning}
        />
        <QuickActionCard
          title="Upload Claims"
          description="Process a JSONL file with healthcare claims"
          icon={Upload}
          href="/processing"
          variant="secondary"
          disabled={!isRunning}
        />
        <QuickActionCard
          title="View Results"
          description="Analyze processing results and performance metrics"
          icon={BarChart3}
          href="/results"
          variant="secondary"
        />
      </div>

      {/* Recent Activity */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
        <div className="space-y-4">
          {isRunning ? (
            <div className="flex items-center space-x-3 p-3 bg-success-50 rounded-lg">
              <div className="w-2 h-2 bg-success-500 rounded-full animate-pulse" />
              <div className="flex-1">
                <p className="text-sm font-medium text-success-900">
                  Simulator is running
                </p>
                <p className="text-xs text-success-700">
                  Processing claims and generating reports
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
              <div className="w-2 h-2 bg-gray-400 rounded-full" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">
                  Simulator is stopped
                </p>
                <p className="text-xs text-gray-700">
                  Start the simulator to begin processing claims
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Configuration Presets */}
      {presets && presets.data && presets.data.length > 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Available Configurations</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {presets.data.slice(0, 6).map((preset) => (
              <div
                key={preset.name}
                className="p-4 border border-gray-200 rounded-lg hover:border-primary-300 transition-colors"
              >
                <h3 className="font-medium text-gray-900">{preset.displayName}</h3>
                <p className="text-sm text-gray-600 mt-1">{preset.description}</p>
                <Link
                  to="/configuration"
                  className="inline-flex items-center text-sm text-primary-600 hover:text-primary-700 mt-2"
                >
                  Use this config
                  <Settings className="ml-1 h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
} 
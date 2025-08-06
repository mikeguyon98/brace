import { useQuery } from 'react-query'
import { BarChart3, DollarSign, TrendingUp, Activity, Database, Clock } from 'lucide-react'
import { apiClient } from '../lib/api'
import { ResultsCard } from '../components/ResultsCard'
import { PayerBreakdownChart } from '../components/PayerBreakdownChart'

export function Results() {
  const { data: results, isLoading } = useQuery(
    'simulator-results',
    () => apiClient.getResults(),
    {
      refetchInterval: 5000, // Poll every 5 seconds
      refetchIntervalInBackground: true,
    }
  )

  const { data: status } = useQuery(
    'simulator-status',
    () => apiClient.getStatus(),
    {
      refetchInterval: 5000,
      refetchIntervalInBackground: true,
    }
  )

  const stats = results?.data?.stats || status?.data?.stats
  const processingStatus = results?.data?.processingStatus || status?.data?.status

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Results</h1>
            <p className="text-gray-600 mt-1">
              Processing results and analytics
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-6">
              <div className="h-8 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="h-4 bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Results</h1>
            <p className="text-gray-600 mt-1">
              Processing results and analytics
            </p>
          </div>
        </div>
        <div className="card p-12 text-center">
          <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Available</h3>
          <p className="text-gray-600">
            Start processing claims to see results and analytics
          </p>
        </div>
      </div>
    )
  }

  const paymentRate = stats.billing?.totalBilledAmount 
    ? (stats.billing.totalPaidAmount / stats.billing.totalBilledAmount) * 100 
    : 0

  const throughput = stats.billing?.totalClaims && processingStatus?.startTime
    ? stats.billing.totalClaims / ((new Date().getTime() - new Date(processingStatus.startTime).getTime()) / 1000)
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Results</h1>
          <p className="text-gray-600 mt-1">
            Processing results and analytics
          </p>
        </div>
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Clock className="h-4 w-4" />
          <span>
            Last updated: {new Date().toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <ResultsCard
          title="Total Claims"
          value={stats.billing?.totalClaims?.toLocaleString() || '0'}
          icon={Database}
          color="blue"
        />
        <ResultsCard
          title="Amount Billed"
          value={`$${stats.billing?.totalBilledAmount?.toLocaleString() || '0'}`}
          icon={DollarSign}
          color="green"
        />
        <ResultsCard
          title="Amount Paid"
          value={`$${stats.billing?.totalPaidAmount?.toLocaleString() || '0'}`}
          icon={TrendingUp}
          color="purple"
        />
        <ResultsCard
          title="Payment Rate"
          value={`${paymentRate.toFixed(1)}%`}
          icon={Activity}
          color="orange"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance Metrics */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Performance Metrics</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
              <span className="text-sm font-medium text-gray-700">Processing Throughput</span>
              <span className="text-sm font-bold text-gray-900">
                {throughput.toFixed(2)} claims/sec
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
              <span className="text-sm font-medium text-gray-700">Patient Responsibility</span>
              <span className="text-sm font-bold text-gray-900">
                ${stats.billing?.totalPatientResponsibility?.toLocaleString() || '0'}
              </span>
            </div>
          </div>
        </div>

        {/* Payer Performance */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Payer Performance</h2>
          <div className="space-y-3">
            {stats.payers?.map((payer) => (
              <div key={payer.payerId} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div>
                  <p className="text-sm font-medium text-gray-900">{payer.payerName}</p>
                  <p className="text-xs text-gray-600">{payer.claimsProcessed} claims</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900">
                    {(payer.claimsProcessed / (stats.billing?.totalClaims || 1) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Payer Breakdown Chart */}
      {stats.payers && stats.payers.length > 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Payer Distribution</h2>
          <PayerBreakdownChart payers={stats.payers} />
        </div>
      )}

      {/* Processing Status */}
      {processingStatus && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Processing Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded">
              <p className="text-2xl font-bold text-gray-900">
                {processingStatus.totalClaims?.toLocaleString() || '0'}
              </p>
              <p className="text-sm text-gray-600">Total Claims</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded">
              <p className="text-2xl font-bold text-gray-900">
                {processingStatus.processedClaims?.toLocaleString() || '0'}
              </p>
              <p className="text-sm text-gray-600">Processed</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded">
              <p className="text-2xl font-bold text-gray-900">
                {processingStatus.progress?.toFixed(1) || '0'}%
              </p>
              <p className="text-sm text-gray-600">Complete</p>
            </div>
          </div>
        </div>
      )}

      {/* Service Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-6">
          <h3 className="text-md font-semibold text-gray-900 mb-3">Ingestion Service</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Files Processed</span>
              <span className="text-sm font-medium">{stats.ingestion?.filesProcessed || '0'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Claims Processed</span>
              <span className="text-sm font-medium">{stats.ingestion?.claimsProcessed || '0'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Errors</span>
              <span className="text-sm font-medium text-danger-600">{stats.ingestion?.errors || '0'}</span>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="text-md font-semibold text-gray-900 mb-3">Clearinghouse Service</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Claims Processed</span>
              <span className="text-sm font-medium">{stats.clearinghouse?.claimsProcessed || '0'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Claims Routed</span>
              <span className="text-sm font-medium">{stats.clearinghouse?.claimsRouted || '0'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Errors</span>
              <span className="text-sm font-medium text-danger-600">{stats.clearinghouse?.errors || '0'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 
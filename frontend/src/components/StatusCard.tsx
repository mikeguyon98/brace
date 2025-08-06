import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react'

interface StatusCardProps {
  title: string
  value: string
  icon: LucideIcon
  trend?: 'up' | 'down'
  trendValue?: string
  loading?: boolean
}

export function StatusCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  trendValue, 
  loading 
}: StatusCardProps) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          {loading ? (
            <div className="h-8 w-20 bg-gray-200 rounded animate-pulse mt-2" />
          ) : (
            <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          )}
          {trend && trendValue && !loading && (
            <div className={`flex items-center text-sm mt-2 ${
              trend === 'up' ? 'text-success-600' : 'text-danger-600'
            }`}>
              {trend === 'up' ? (
                <TrendingUp className="h-4 w-4 mr-1" />
              ) : (
                <TrendingDown className="h-4 w-4 mr-1" />
              )}
              {trendValue}
            </div>
          )}
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-100">
          <Icon className="h-6 w-6 text-primary-600" />
        </div>
      </div>
    </div>
  )
} 
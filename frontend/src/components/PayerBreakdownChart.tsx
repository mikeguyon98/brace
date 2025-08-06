interface Payer {
  payerId: string
  payerName: string
  claimsProcessed: number
  averageProcessingTime: number
  errors: number
}

interface PayerBreakdownChartProps {
  payers: Payer[]
}

export function PayerBreakdownChart({ payers }: PayerBreakdownChartProps) {
  const totalClaims = payers.reduce((sum, payer) => sum + payer.claimsProcessed, 0)
  
  const colors = [
    'bg-blue-500',
    'bg-green-500', 
    'bg-purple-500',
    'bg-orange-500',
    'bg-red-500',
    'bg-indigo-500',
    'bg-pink-500',
    'bg-yellow-500'
  ]

  return (
    <div className="space-y-4">
      {/* Chart */}
      <div className="flex h-8 rounded-lg overflow-hidden">
        {payers.map((payer, index) => {
          const percentage = totalClaims > 0 ? (payer.claimsProcessed / totalClaims) * 100 : 0
          return (
            <div
              key={payer.payerId}
              className={`${colors[index % colors.length]} transition-all duration-300`}
              style={{ width: `${percentage}%` }}
              title={`${payer.payerName}: ${payer.claimsProcessed} claims (${percentage.toFixed(1)}%)`}
            />
          )
        })}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {payers.map((payer, index) => {
          const percentage = totalClaims > 0 ? (payer.claimsProcessed / totalClaims) * 100 : 0
          return (
            <div key={payer.payerId} className="flex items-center space-x-3">
              <div className={`w-4 h-4 rounded ${colors[index % colors.length]}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {payer.payerName}
                </p>
                <p className="text-xs text-gray-600">
                  {payer.claimsProcessed} claims ({percentage.toFixed(1)}%)
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
} 
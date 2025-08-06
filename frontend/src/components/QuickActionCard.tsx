import { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

interface QuickActionCardProps {
  title: string
  description: string
  icon: LucideIcon
  href: string
  variant?: 'primary' | 'secondary'
  disabled?: boolean
}

export function QuickActionCard({ 
  title, 
  description, 
  icon: Icon, 
  href, 
  variant = 'secondary',
  disabled = false 
}: QuickActionCardProps) {
  const baseClasses = "card p-6 transition-all duration-200"
  const variantClasses = {
    primary: "border-primary-200 bg-primary-50 hover:border-primary-300 hover:bg-primary-100",
    secondary: "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
  }
  const disabledClasses = "opacity-50 cursor-not-allowed hover:border-gray-200 hover:bg-white"

  const classes = `${baseClasses} ${disabled ? disabledClasses : variantClasses[variant]}`

  if (disabled) {
    return (
      <div className={classes}>
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
            <Icon className="h-5 w-5 text-gray-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-gray-900">{title}</h3>
            <p className="text-sm text-gray-600 mt-1">{description}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Link to={href} className={classes}>
      <div className="flex items-center space-x-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
          variant === 'primary' ? 'bg-primary-100' : 'bg-gray-100'
        }`}>
          <Icon className={`h-5 w-5 ${
            variant === 'primary' ? 'text-primary-600' : 'text-gray-600'
          }`} />
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-gray-900">{title}</h3>
          <p className="text-sm text-gray-600 mt-1">{description}</p>
        </div>
      </div>
    </Link>
  )
} 
import { NavLink } from 'react-router-dom'
import { Home, Settings, Play, BarChart3, Activity, Database } from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/', icon: Home },
  { name: 'Configuration', href: '/configuration', icon: Settings },
  { name: 'Processing', href: '/processing', icon: Play },
  { name: 'Results', href: '/results', icon: BarChart3 },
]

export function Navigation() {
  return (
    <div className="flex w-64 flex-col bg-white shadow-sm border-r border-gray-200">
      <div className="flex h-16 items-center px-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Billing Simulator</h1>
            <p className="text-xs text-gray-500">Healthcare Claims</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                `group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 border-r-2 border-primary-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <Icon className="mr-3 h-5 w-5 flex-shrink-0" />
              {item.name}
            </NavLink>
          )
        })}
      </nav>

      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center space-x-2 text-xs text-gray-500">
          <Database className="h-4 w-4" />
          <span>v2.0.0</span>
        </div>
      </div>
    </div>
  )
} 
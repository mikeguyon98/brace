import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Configuration } from './pages/Configuration'
import { Processing } from './pages/Processing'
import { Results } from './pages/Results'
import { Navigation } from './components/Navigation'

function App() {
  return (
    <Layout>
      <Navigation />
      <main className="flex-1 p-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/configuration" element={<Configuration />} />
          <Route path="/processing" element={<Processing />} />
          <Route path="/results" element={<Results />} />
        </Routes>
      </main>
    </Layout>
  )
}

export default App 
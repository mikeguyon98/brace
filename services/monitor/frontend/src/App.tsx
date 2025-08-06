import { useState, useEffect } from 'react'
import { Activity, Server, Play, RefreshCw } from 'lucide-react'

interface QueueMetrics {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

interface SystemMetrics {
  queues: QueueMetrics[];
  redis: {
    connected: boolean;
    usedMemory?: string;
    connectedClients?: number;
  };
  processingMetrics: {
    totalClaimsIngested: number;
    totalClaimsProcessed: number;
    totalRemittancesGenerated: number;
    totalErrors: number;
    payerBreakdown: Record<string, {
      claimsProcessed: number;
      errors: number;
    }>;
    processingRates: {
      claimsPerSecond: number;
      remittancesPerSecond: number;
    };
    startTime: number;
    elapsedSeconds: number;
  };
  timestamp: number;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function App() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  // Ingestion form state
  const [filePath, setFilePath] = useState('/data/claims.jsonl');
  const [rate, setRate] = useState('2.0');
  const [ingestionLoading, setIngestionLoading] = useState(false);
  const [ingestionMessage, setIngestionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/metrics');
      const result: ApiResponse<SystemMetrics> = await response.json();
      
      if (result.success && result.data) {
        setMetrics(result.data);
        setLastUpdate(new Date());
        setError(null);
      } else {
        setError(result.error || 'Failed to fetch metrics');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const triggerIngestion = async () => {
    setIngestionLoading(true);
    setIngestionMessage(null);
    
    try {
      const response = await fetch('/api/ingestion/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filePath,
          rate: parseFloat(rate),
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        setIngestionMessage({ type: 'success', text: result.message });
        // Clear success message after 10 seconds
        setTimeout(() => setIngestionMessage(null), 10000);
      } else {
        setIngestionMessage({ type: 'error', text: result.error || 'Failed to start ingestion' });
      }
    } catch (err) {
      setIngestionMessage({ 
        type: 'error', 
        text: err instanceof Error ? err.message : 'Network error - please check if the monitor service is running' 
      });
    } finally {
      setIngestionLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    
    // Auto-refresh every 2 seconds
    const interval = setInterval(fetchMetrics, 2000);
    
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="container">
        <div className="loading">
          <RefreshCw className="animate-spin mr-2" size={20} />
          Loading metrics...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="alert alert-error">
          Error: {error}
        </div>
      </div>
    );
  }

  const totalWaiting = metrics?.queues.reduce((sum, q) => sum + q.waiting, 0) || 0;
  const totalActive = metrics?.queues.reduce((sum, q) => sum + q.active, 0) || 0;
  const totalProcessed = metrics?.processingMetrics.totalClaimsIngested || 0;
  const totalRemittances = metrics?.processingMetrics.totalRemittancesGenerated || 0;

  return (
    <div className="container">
      <div className="header">
        <h1>Claims Processing Monitor</h1>
        <p>Real-time monitoring of your medical billing claims processing system</p>
      </div>

      {/* System Overview */}
      <div className="grid grid-3">
        <div className="card">
          <h3>
            <Activity className="inline mr-2" size={18} />
            System Status
          </h3>
          <div className="metric">
            <span className="metric-label">Redis Connection</span>
            <span className="metric-value">
              <span className={`status-indicator ${metrics?.redis.connected ? 'status-ok' : 'status-error'}`}></span>
              {metrics?.redis.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          {metrics?.redis.usedMemory && (
            <div className="metric">
              <span className="metric-label">Redis Memory</span>
              <span className="metric-value">{metrics.redis.usedMemory}</span>
            </div>
          )}
          {metrics?.redis.connectedClients && (
            <div className="metric">
              <span className="metric-label">Connected Clients</span>
              <span className="metric-value">{metrics.redis.connectedClients}</span>
            </div>
          )}
        </div>

        <div className="card">
          <h3>
            <Server className="inline mr-2" size={18} />
            Processing Overview
          </h3>
          <div className="metric">
            <span className="metric-label">Claims Ingested</span>
            <span className="metric-value">{totalProcessed.toLocaleString()}</span>
          </div>
          <div className="metric">
            <span className="metric-label">Claims Processed</span>
            <span className="metric-value">{metrics?.processingMetrics.totalClaimsProcessed.toLocaleString() || 0}</span>
          </div>
          <div className="metric">
            <span className="metric-label">Remittances Generated</span>
            <span className="metric-value">{totalRemittances.toLocaleString()}</span>
          </div>
          <div className="metric">
            <span className="metric-label">Processing Rate</span>
            <span className="metric-value">{metrics?.processingMetrics.processingRates.claimsPerSecond.toFixed(2) || '0.00'} claims/sec</span>
          </div>
        </div>

        <div className="card">
          <h3>
            <Play className="inline mr-2" size={18} />
            Start Processing
          </h3>
          <div className="form-group">
            <label htmlFor="filePath">Claims File</label>
            <select
              id="filePath"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              disabled={ingestionLoading}
            >
              <option value="/data/claims.jsonl">claims.jsonl (501 claims)</option>
              <option value="/data/test-claims.jsonl">test-claims.jsonl (51 claims)</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="rate">Processing Rate (claims/sec)</label>
            <input
              id="rate"
              type="number"
              step="0.1"
              min="0.1"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="2.0"
              disabled={ingestionLoading}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={triggerIngestion}
            disabled={ingestionLoading || !filePath || !rate}
            style={{ width: '100%' }}
          >
            {ingestionLoading ? (
              <>
                <RefreshCw className="animate-spin mr-2" size={16} />
                Starting Ingestion...
              </>
            ) : (
              <>
                <Play className="mr-2" size={16} />
                Start Claims Processing
              </>
            )}
          </button>
          
          {ingestionMessage && (
            <div className={`alert alert-${ingestionMessage.type}`}>
              <strong>{ingestionMessage.type === 'success' ? '✅ Success: ' : '❌ Error: '}</strong>
              {ingestionMessage.text}
            </div>
          )}
        </div>
      </div>

      {/* Queue Details */}
      <div className="grid grid-2">
        <div className="card">
          <h3>Current Queue Status</h3>
          <div className="queue-grid">
            {metrics?.queues.map((queue) => (
              <div key={queue.name} className="queue-card">
                <div className="queue-header">
                  <div className="queue-name">{queue.name}</div>
                  <div className="queue-status">
                    {queue.paused ? 'Paused' : 'Active'}
                  </div>
                </div>
                <div className="queue-metrics">
                  <div className="queue-metric">
                    <div className="queue-metric-value">{queue.waiting}</div>
                    <div className="queue-metric-label">Waiting</div>
                  </div>
                  <div className="queue-metric">
                    <div className="queue-metric-value">{queue.active}</div>
                    <div className="queue-metric-label">Active</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="card">
          <h3>Payer Processing Totals</h3>
          <div className="queue-grid">
            {metrics?.processingMetrics.payerBreakdown && Object.entries(metrics.processingMetrics.payerBreakdown).map(([payerId, stats]) => (
              <div key={payerId} className="queue-card">
                <div className="queue-header">
                  <div className="queue-name">{payerId}</div>
                  <div className="queue-status">
                    {stats.errors > 0 ? `${stats.errors} errors` : 'OK'}
                  </div>
                </div>
                <div className="queue-metrics">
                  <div className="queue-metric">
                    <div className="queue-metric-value">{stats.claimsProcessed}</div>
                    <div className="queue-metric-label">Processed</div>
                  </div>
                  <div className="queue-metric">
                    <div className="queue-metric-value">{stats.errors}</div>
                    <div className="queue-metric-label">Errors</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="refresh-info">
        Last updated: {lastUpdate?.toLocaleTimeString()} (refreshes every 2 seconds)
      </div>
    </div>
  )
}

export default App
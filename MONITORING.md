# Monitoring Dashboard Guide

The monitoring dashboard provides real-time visibility into your claims processing system with minimal performance impact.

## Quick Start

### Start with Monitoring (Recommended)
```bash
./scripts/start-with-monitoring.sh
```

Then open http://localhost:3001 in your browser.

### Start without Monitoring (Maximum Performance)
```bash
./scripts/start-without-monitoring.sh
```

Use this when you need maximum processing performance or in production environments.

## Dashboard Features

### System Overview
- **Redis Connection Status**: Shows if the queue system is healthy
- **Memory Usage**: Redis memory consumption
- **Queue Summary**: Total items waiting, processing, and completed

### Queue Monitoring
Real-time metrics for each queue:
- **claims-ingestion**: New claims waiting for processing
- **payer-aetna**, **payer-bcbs**, etc.: Claims being processed by each payer
- **remittance-return**: Processed claims ready for delivery

### Process Control
- **Start Processing**: Upload and process claims files directly from the UI
- **Rate Control**: Set processing rate (claims per second)
- **Live Feedback**: See results and any errors immediately

## Performance Impact

The monitoring dashboard is designed to be lightweight:

- **Minimal CPU**: Only queries Redis every 2 seconds
- **Low Memory**: React app served as static files
- **Optional**: Completely disabled when not needed
- **No Database**: Uses existing Redis for metrics

## Advanced Usage

### Manual Docker Commands
```bash
# Start with monitoring
docker-compose --profile monitoring up -d

# Start without monitoring (default)
docker-compose up -d

# Stop monitoring service only
docker-compose stop monitor
```

### Environment Variables
- `REDIS_HOST`: Redis hostname (default: redis)
- `REDIS_PORT`: Redis port (default: 6379)
- `PORT`: Dashboard port (default: 3001)

### Development
```bash
# Run monitoring API in development mode
cd services/monitor
npm run dev

# Run React frontend in development mode
cd services/monitor/frontend
npm run dev
```

## Troubleshooting

### Dashboard Not Loading
1. Check if monitoring is enabled: `docker-compose ps monitor`
2. Check logs: `docker-compose logs monitor`
3. Verify port is accessible: `curl http://localhost:3001/api/health`

### Ingestion Not Starting from Dashboard
1. Ensure the claims file exists: `docker-compose exec monitor ls -la /app/workspace/`
2. Check Docker socket permissions
3. View ingestion logs: `docker-compose logs ingestion`

### Performance Issues
- Use start-without-monitoring.sh for maximum performance
- Reduce dashboard refresh rate by editing App.tsx
- Scale individual payer services: `docker-compose up -d --scale payer-aetna=3`

## API Endpoints

For custom integrations:

- `GET /api/health` - Service health check
- `GET /api/metrics` - Queue and system metrics
- `GET /api/queues/:name/jobs?status=waiting&limit=10` - Queue job details
- `POST /api/ingestion/trigger` - Start claims processing

Example:
```bash
curl -X POST http://localhost:3001/api/ingestion/trigger \
  -H "Content-Type: application/json" \
  -d '{"filePath": "/data/claims.jsonl", "rate": 2.0}'
```
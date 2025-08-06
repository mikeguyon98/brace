# Billing Simulator Web Interface

A modern React web interface for the healthcare billing simulator, providing an intuitive way to configure, run, and monitor the billing processing pipeline.

## Features

### 🎯 **Dual Interface Support**
- **CLI Mode**: Continue using the existing command-line interface
- **Web Interface**: New React-based web application for visual configuration and monitoring

### 🚀 **Web Interface Features**
- **Configuration Management**: Visual configuration editor with preset support
- **File Upload**: Drag-and-drop JSONL file upload with progress tracking
- **Real-time Monitoring**: Live processing status and performance metrics
- **Results Analytics**: Comprehensive results dashboard with charts and statistics
- **Responsive Design**: Modern, mobile-friendly interface

## Quick Start

### Prerequisites
- Node.js 18+ and pnpm
- Existing billing simulator setup

### Installation

1. **Install dependencies for all packages:**
   ```bash
   pnpm install
   ```

2. **Build all packages:**
   ```bash
   pnpm run build
   ```

### Running the Web Interface

#### Option 1: Start Both API and Frontend
```bash
pnpm run start:web
```
This starts both the API server (port 3001) and frontend (port 3000) concurrently.

#### Option 2: Start Separately
```bash
# Terminal 1: Start API server
pnpm run start:api

# Terminal 2: Start frontend
pnpm run start:frontend
```

#### Option 3: Continue Using CLI
```bash
# Use existing CLI commands
pnpm run start:single-process
pnpm run single-process
```

## Web Interface Usage

### 1. Dashboard
- **Overview**: View current simulator status and key metrics
- **Quick Actions**: Start simulator, upload files, view results
- **Recent Activity**: Monitor processing status
- **Configuration Presets**: Quick access to predefined configurations

### 2. Configuration
- **Preset Selection**: Choose from predefined configurations
- **Visual Editor**: Modify settings through an intuitive form interface
- **Validation**: Real-time configuration validation
- **Tabs**: Organized settings for General, Payers, and Databases

### 3. Processing
- **File Upload**: Drag-and-drop JSONL files
- **Progress Tracking**: Real-time processing progress
- **Status Monitoring**: Live updates on processing status
- **Performance Metrics**: Throughput and queue statistics

### 4. Results
- **Key Metrics**: Total claims, amounts, payment rates
- **Performance Analytics**: Processing throughput and timing
- **Payer Breakdown**: Distribution and performance by payer
- **Service Statistics**: Detailed service-level metrics

## API Endpoints

The web interface communicates with the API server on port 3001:

### Health & Status
- `GET /api/health` - Health check
- `GET /api/simulator/status` - Current simulator status

### Configuration
- `GET /api/config/default` - Get default configuration
- `GET /api/config/presets` - Get available preset configurations
- `POST /api/config/validate` - Validate configuration

### Simulator Control
- `POST /api/simulator/start` - Start simulator with configuration
- `POST /api/simulator/stop` - Stop simulator
- `POST /api/simulator/process` - Upload and process claims file
- `GET /api/simulator/results` - Get processing results

## Configuration Presets

The web interface includes several predefined configurations:

- **Default**: Basic configuration for testing
- **High Performance**: Optimized for maximum throughput
- **Aging Demo**: Focused on AR aging analysis
- **Denial Demo**: Demonstrates claim denial scenarios
- **Parallel Demo**: Parallel processing demonstration

## File Format

The web interface accepts JSONL (JSON Lines) files with the following structure:

```json
{"claim_id": "CLM001", "patient_id": "PAT001", "payer_id": "anthem", "billed_amount": 1500.00, "service_date": "2024-01-15"}
{"claim_id": "CLM002", "patient_id": "PAT002", "payer_id": "medicare", "billed_amount": 2200.00, "service_date": "2024-01-16"}
```

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React App     │    │   API Server    │    │  Billing        │
│   (Port 3000)   │◄──►│   (Port 3001)   │◄──►│  Simulator      │
│                 │    │                 │    │                 │
│ - Dashboard     │    │ - Express.js    │    │ - Core Logic    │
│ - Configuration │    │ - File Upload   │    │ - Services      │
│ - Processing    │    │ - Validation    │    │ - Queues        │
│ - Results       │    │ - Status API    │    │ - Database      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Development

### Project Structure
```
├── api/                    # Express.js API server
│   ├── src/
│   │   └── index.ts       # Main API server
│   ├── package.json
│   └── tsconfig.json
├── frontend/              # React frontend
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── pages/         # Page components
│   │   ├── lib/           # API client and utilities
│   │   └── main.tsx       # App entry point
│   ├── package.json
│   └── vite.config.ts
└── src/                   # Existing simulator code
```

### Development Commands
```bash
# API development
cd api && pnpm run dev

# Frontend development
cd frontend && pnpm run dev

# Build all
pnpm run build

# Lint all
pnpm run lint

# Format all
pnpm run format
```

## Environment Variables

### Frontend (.env)
```env
VITE_API_URL=http://localhost:3001/api
```

### API (.env)
```env
PORT=3001
NODE_ENV=development
```

## Troubleshooting

### Common Issues

1. **API Connection Failed**
   - Ensure API server is running on port 3001
   - Check CORS configuration in API server
   - Verify proxy settings in Vite config

2. **File Upload Issues**
   - Check file format (must be JSONL)
   - Verify file size (max 50MB)
   - Ensure simulator is running before upload

3. **Configuration Validation Errors**
   - Check all required fields are filled
   - Verify numeric values are within valid ranges
   - Ensure payer configurations are complete

### Logs
- API logs: `api/logs/`
- Frontend logs: Browser developer console
- Simulator logs: Existing logging system

## Contributing

1. Follow the existing code style and patterns
2. Add TypeScript types for all new interfaces
3. Include proper error handling
4. Test both CLI and web interfaces
5. Update documentation for new features

## License

Same as the main billing simulator project. 
import React, { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { Upload, Play, Square, FileText, Activity, BarChart3 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { useDropzone } from 'react-dropzone'
import { apiClient } from '../lib/api'
import { ProgressBar } from '../components/ProgressBar'

export function Processing() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // Fetch simulator status
  const { data: status, isLoading } = useQuery(
    'simulator-status',
    () => apiClient.getStatus(),
    {
      refetchInterval: 2000, // Poll every 2 seconds during processing
      refetchIntervalInBackground: true,
    }
  )

  // Upload and process file mutation
  const uploadMutation = useMutation(
    (file: File) => apiClient.uploadFile(file),
    {
      onSuccess: () => {
        toast.success('File uploaded successfully! Processing started...')
        setIsProcessing(true)
        setUploadedFile(null) // Clear uploaded file to allow selecting another
        queryClient.invalidateQueries('simulator-status')
      },
      onError: (error: any) => {
        toast.error(`Upload failed: ${error.response?.data?.error || error.message}`)
        setIsProcessing(false)
      },
    }
  )

  // Stop simulator mutation
  const stopMutation = useMutation(
    () => apiClient.stopSimulator(),
    {
      onSuccess: () => {
        toast.success('Simulator stopped successfully')
        queryClient.invalidateQueries('simulator-status')
        setIsProcessing(false)
      },
      onError: (error: any) => {
        toast.error(`Failed to stop simulator: ${error.response?.data?.error || error.message}`)
      },
    }
  )

  // Dropzone configuration
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/json': ['.json', '.jsonl'],
      'text/plain': ['.jsonl']
    },
    maxFiles: 1,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setUploadedFile(acceptedFiles[0])
      }
    },
  })

  const handleUpload = () => {
    if (!uploadedFile) {
      toast.error('Please select a file first')
      return
    }

    if (!status?.data?.isRunning) {
      toast.error('Simulator must be running to process files')
      return
    }

    uploadMutation.mutate(uploadedFile)
  }

  const handleStop = () => {
    stopMutation.mutate()
  }

  const handleViewResults = () => {
    navigate('/results')
  }

  const isRunning = status?.data?.isRunning || false
  const processingStatus = status?.data?.status
  const stats = status?.data?.stats

  // Calculate progress
  const progress = processingStatus?.totalClaims 
    ? (processingStatus.processedClaims / processingStatus.totalClaims) * 100 
    : 0

  // Check if current processing cycle is complete
  const isCurrentFileComplete = progress === 100 && !isRunning
  
  // Reset processing state when a file completes
  React.useEffect(() => {
    if (isCurrentFileComplete && isProcessing) {
      setIsProcessing(false)
    }
  }, [isCurrentFileComplete, isProcessing])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Processing</h1>
          <p className="text-gray-600 mt-1">
            Upload and process healthcare claims files
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
          {isRunning && (
            <button
              onClick={handleStop}
              disabled={stopMutation.isLoading}
              className="btn btn-danger btn-sm"
            >
              {stopMutation.isLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <Square className="h-4 w-4 mr-1" />
              )}
              Stop
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* File Upload */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Upload Claims File</h2>
            {isCurrentFileComplete && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Ready for next file
              </span>
            )}
          </div>
          
          {!isRunning ? (
            <div className="text-center py-8">
              <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Simulator Not Running</h3>
              <p className="text-gray-600 mb-4">
                Start the simulator from the Configuration page before uploading files
              </p>
              <button
                onClick={() => navigate('/configuration')}
                className="btn btn-primary"
              >
                Go to Configuration
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-primary-400 bg-primary-50'
                    : 'border-gray-300 hover:border-primary-400 hover:bg-primary-50'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                {isDragActive ? (
                  <p className="text-primary-600">Drop the file here...</p>
                ) : (
                  <div>
                    <p className="text-gray-600">
                      Drag & drop a JSONL file here, or click to select
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Supports .json and .jsonl files
                    </p>
                  </div>
                )}
              </div>

              {uploadedFile && (
                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <FileText className="h-5 w-5 text-gray-600" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{uploadedFile.name}</p>
                    <p className="text-xs text-gray-600">
                      {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
              )}

              <button
                onClick={handleUpload}
                disabled={!uploadedFile || uploadMutation.isLoading || !isRunning}
                className="w-full btn btn-primary btn-lg"
              >
                {uploadMutation.isLoading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                ) : (
                  <Play className="h-5 w-5 mr-2" />
                )}
                Upload & Process
              </button>
            </div>
          )}
        </div>

        {/* Processing Status */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Processing Status</h2>
          
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-4 bg-gray-200 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Progress */}
              {isProcessing && processingStatus && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Progress</span>
                    <span className="text-sm text-gray-600">
                      {processingStatus.processedClaims} / {processingStatus.totalClaims} claims
                    </span>
                  </div>
                  <ProgressBar progress={progress} />
                  <p className="text-xs text-gray-500 mt-1">
                    {progress.toFixed(1)}% complete
                  </p>
                </div>
              )}

              {/* Current File */}
              {processingStatus?.currentFile && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Current File</h3>
                  <div className="flex items-center space-x-2 p-2 bg-gray-50 rounded">
                    <FileText className="h-4 w-4 text-gray-600" />
                    <span className="text-sm text-gray-900">{processingStatus.currentFile}</span>
                  </div>
                </div>
              )}

              {/* Processing Stats */}
              {stats && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-700">Processing Statistics</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-gray-50 rounded">
                      <p className="text-2xl font-bold text-gray-900">
                        {stats.billing?.totalClaims?.toLocaleString() || '0'}
                      </p>
                      <p className="text-xs text-gray-600">Total Claims</p>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded">
                      <p className="text-2xl font-bold text-gray-900">
                        ${stats.billing?.totalBilledAmount?.toLocaleString() || '0'}
                      </p>
                      <p className="text-xs text-gray-600">Amount Billed</p>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded">
                      <p className="text-2xl font-bold text-gray-900">
                        ${stats.billing?.totalPaidAmount?.toLocaleString() || '0'}
                      </p>
                      <p className="text-xs text-gray-600">Amount Paid</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="pt-4 border-t border-gray-200">
                {processingStatus?.progress === 100 && isRunning ? (
                  <button
                    disabled
                    className="w-full btn btn-secondary opacity-50 cursor-not-allowed"
                    title="Processing is finalizing. Please wait for completion."
                  >
                    <Activity className="h-4 w-4 mr-2 animate-spin" />
                    Finalizing...
                  </button>
                ) : (
                  <button
                    onClick={handleViewResults}
                    className="w-full btn btn-secondary"
                  >
                    <BarChart3 className="h-4 w-4 mr-2" />
                    View Results
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Processing Complete */}
      {isCurrentFileComplete && (
        <div className="card p-6 bg-success-50 border-success-200">
          <div className="flex items-center space-x-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success-100">
              <BarChart3 className="h-5 w-5 text-success-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-medium text-success-900">
                File Processing Complete!
              </h3>
              <p className="text-success-700">
                Current file has been processed successfully. You can upload and process another file or view results.
              </p>
            </div>
            <button
              onClick={handleViewResults}
              className="btn btn-success"
            >
              View Results
            </button>
          </div>
        </div>
      )}
      
      {/* Processing In Progress Warning */}
      {processingStatus?.progress === 100 && isRunning && (
        <div className="card p-6 bg-yellow-50 border-yellow-200">
          <div className="flex items-center space-x-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-100">
              <Activity className="h-5 w-5 text-yellow-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-medium text-yellow-900">
                Finalizing Processing...
              </h3>
              <p className="text-yellow-700">
                Claims processing is at 100% but the system is still finalizing all records. Please wait for completion before viewing final results.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Sidebar } from '@/components/sidebar'
import { DocumentList } from '@/components/document-list'
import { DatasetCreateWizard } from '@/components/dataset-create-wizard'
import { type Dataset } from '@/lib/api'
import { authUtil } from '@/lib/auth'

export default function Home() {
  const [query, setQuery] = useState('')
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null)
  const [datasetKey, setDatasetKey] = useState(0)

  const [showCreateWizard, setShowCreateWizard] = useState(false)
  const [sidebarRefreshTrigger, setSidebarRefreshTrigger] = useState(0)

  // Fix hydration mismatch by using consistent initial state
  const [sidebarMinimized, setSidebarMinimized] = useState(false) // Always start with false for SSR

  const router = useRouter()

  // Set client state after hydration to prevent mismatch
  useEffect(() => {
    const saved = localStorage.getItem('sidebarMinimized')
    if (saved) {
      setSidebarMinimized(JSON.parse(saved))
    }
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    // TODO: Implement global search functionality
  }

  const handleCreateDataset = () => {
    setShowCreateWizard(true)
  }

  const handleWizardComplete = (dataset: Dataset) => {
    setShowCreateWizard(false)
    setSelectedDataset(dataset)
    setDatasetKey(prev => prev + 1)
    // Refresh sidebar to show new dataset
    setSidebarRefreshTrigger(prev => prev + 1)
  }

  const handleWizardClose = () => {
    setShowCreateWizard(false)
  }

  const handleDatasetClick = (dataset: Dataset) => {
    router.push(`/datasets/${dataset.id}`)
  }

  const handleLogout = async () => {
    try {
      await authUtil.logout()
      // Redirect to login page after successful logout
      router.push('/login')
    } catch (error) {
      console.error('Logout failed:', error)
      // Even if server logout fails, clear local data and redirect
      router.push('/login')
    }
  }

  const handleToggleSidebar = () => {
    const newState = !sidebarMinimized
    setSidebarMinimized(newState)
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebarMinimized', JSON.stringify(newState))
    }
  }

  // Show create wizard
  if (showCreateWizard) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DatasetCreateWizard
          onComplete={handleWizardComplete}
          onClose={handleWizardClose}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar
        onCreateDataset={handleCreateDataset}
        onDatasetClick={handleDatasetClick}
        onLogout={handleLogout}
        refreshTrigger={sidebarRefreshTrigger}
        minimized={sidebarMinimized}
        onToggleMinimized={handleToggleSidebar}
      />

      {/* Main content area - adjusted for sidebar */}
      <div className={`${sidebarMinimized ? 'ml-16' : 'ml-80'} transition-all duration-300`}>
        {selectedDataset ? (
          <div className="p-6">
            <div className="max-w-6xl mx-auto">
              {/* Header */}
              <div className="mb-6">
                <button
                  onClick={() => setSelectedDataset(null)}
                  className="text-blue-500 hover:text-blue-700 mb-4"
                >
                  ← Back to Home
                </button>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    {selectedDataset.name}
                  </h1>
                  {selectedDataset.description && (
                    <p className="text-gray-600 mt-2">{selectedDataset.description}</p>
                  )}
                </div>
              </div>

              {/* Document List */}
              <DocumentList
                key={`${selectedDataset.id}-${datasetKey}`}
                datasetId={selectedDataset.id}
                dataset={selectedDataset}
                onDatasetDeleted={() => {
                  setSelectedDataset(null)
                  setSidebarRefreshTrigger(prev => prev + 1)
                }}
              />
            </div>
          </div>
        ) : (
          <div className="p-6">
            <div className="max-w-6xl mx-auto">
              {/* Welcome Section */}
              <div className="text-center py-16">
                <h1 className="text-4xl font-bold text-gray-900 mb-4">
                  Welcome to Knowledge Hub
                </h1>
                <p className="text-xl text-gray-600 mb-8">
                  Create datasets and manage your documents with AI-powered embeddings
                </p>
                <Button
                  onClick={handleCreateDataset}
                  size="lg"
                  className="px-8 py-3 text-lg"
                >
                  Create Your First Dataset
                </Button>
              </div>

              {/* Search Section */}
              <div className="max-w-2xl mx-auto">
                <form onSubmit={handleSearch} className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      type="search"
                      placeholder="Search across all datasets..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Button type="submit">Search</Button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

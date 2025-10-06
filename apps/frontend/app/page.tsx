'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/navbar'
import { DatasetGrid } from '@/components/dataset-grid'
import { DatasetCreateWizard } from '@/components/dataset-create-wizard'
import { type Dataset } from '@/lib/api'

export default function Home() {
  const [showCreateWizard, setShowCreateWizard] = useState(false)
  const router = useRouter()

  const handleCreateDataset = () => {
    setShowCreateWizard(true)
  }

  const handleWizardComplete = (dataset: Dataset) => {
    setShowCreateWizard(false)
    // Navigate to the newly created dataset page
    router.push(`/datasets/${dataset.id}`)
  }

  const handleWizardClose = () => {
    setShowCreateWizard(false)
  }

  const handleDatasetClick = (dataset: Dataset) => {
    router.push(`/datasets/${dataset.id}`)
  }

  const handleLogout = () => {
    // The navbar handles the actual logout logic
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
      <Navbar onLogout={handleLogout} />

      {/* Main content area */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Your Datasets
          </h1>
          <p className="text-gray-600">
            Create and manage your knowledge bases with AI-powered search
          </p>
        </div>

        <DatasetGrid
          onCreateDataset={handleCreateDataset}
          onDatasetClick={handleDatasetClick}
        />
      </div>
    </div>
  )
}

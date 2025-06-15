'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function Home() {
  const [query, setQuery] = useState('')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    // Implement search functionality here
    console.log('Searching for:', query)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-white">
      <div className="w-full max-w-2xl mx-auto text-center">
        {/* Logo or Title */}
        <h1 className="text-4xl font-bold mb-8 text-gray-900">
          Knowledge Hub
        </h1>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="relative">
            <Input
              type="text"
              placeholder="Search knowledge hub..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-12 pl-12 pr-4 text-lg rounded-full border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
            />
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          </div>

          <div className="flex justify-center gap-4">
            <Button
              type="submit"
              className="px-6 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
            >
              Search
            </Button>
            <Button
              type="button"
              variant="outline"
              className="px-6 py-2 rounded-full hover:bg-gray-100 transition-colors"
            >
              I'm Feeling Lucky
            </Button>
          </div>
        </form>

        {/* Additional Info */}
        <p className="mt-8 text-sm text-gray-500">
          Search through our knowledge base to find what you need
        </p>
      </div>
    </main>
  )
}

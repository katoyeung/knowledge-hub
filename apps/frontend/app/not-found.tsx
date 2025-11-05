'use client'

// Force dynamic rendering to prevent static generation errors
export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function NotFound() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
            <h1 style={{ fontSize: '2.25rem', fontWeight: 'bold', marginBottom: '1rem', margin: 0 }}>404</h1>
            <p style={{ color: '#4b5563', marginBottom: '2rem', margin: 0 }}>Page not found</p>
        </div>
    )
}


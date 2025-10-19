import { JobProgressMonitor } from '@/components/job-progress-monitor';

export default function JobMonitorPage() {
    return (
        <div className="container mx-auto p-6">
            <div className="mb-6">
                <h1 className="text-3xl font-bold">Job Progress Monitor</h1>
                <p className="text-muted-foreground">
                    Real-time monitoring of document processing jobs
                </p>
            </div>

            <JobProgressMonitor
                datasetId="f0ec53c2-afdb-449a-8102-b5cb0d7f0c9b"
                className="max-w-2xl"
            />
        </div>
    );
}

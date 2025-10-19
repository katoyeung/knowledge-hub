'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RefreshCw, CheckCircle, XCircle, Clock, Play } from 'lucide-react';

interface JobStats {
    total: number;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
}

interface DocumentStatus {
    name: string;
    indexing_status: string;
    processing_metadata?: any;
}

interface JobProgressMonitorProps {
    datasetId: string;
    className?: string;
}

export function JobProgressMonitor({ datasetId, className }: JobProgressMonitorProps) {
    const [jobStats, setJobStats] = useState<JobStats>({
        total: 0,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
    });

    const [documentStatus, setDocumentStatus] = useState<DocumentStatus | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const fetchJobStatus = async () => {
        try {
            setIsLoading(true);

            // Fetch job stats (this would be a real API call)
            const response = await fetch(`/api/queue/status`);
            if (response.ok) {
                const data = await response.json();
                setJobStats(data.data || jobStats);
            }

            // Fetch document status
            const docResponse = await fetch(`/api/datasets/${datasetId}/documents`);
            if (docResponse.ok) {
                const docData = await docResponse.json();
                const firstDoc = docData.data?.[0];
                if (firstDoc) {
                    setDocumentStatus({
                        name: firstDoc.name,
                        indexing_status: firstDoc.indexing_status,
                        processing_metadata: firstDoc.processing_metadata,
                    });
                }
            }

            setLastUpdated(new Date());
        } catch (error) {
            console.error('Failed to fetch job status:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        // Fetch immediately
        fetchJobStatus();

        // Then fetch every 2 seconds
        const interval = setInterval(fetchJobStatus, 2000);

        return () => clearInterval(interval);
    }, [datasetId]);

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed':
                return <CheckCircle className="h-4 w-4 text-green-500" />;
            case 'failed':
            case 'error':
                return <XCircle className="h-4 w-4 text-red-500" />;
            case 'active':
            case 'graph_extraction_processing':
                return <Play className="h-4 w-4 text-blue-500" />;
            case 'waiting':
            default:
                return <Clock className="h-4 w-4 text-yellow-500" />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed':
                return 'bg-green-100 text-green-800';
            case 'failed':
            case 'error':
                return 'bg-red-100 text-red-800';
            case 'active':
            case 'graph_extraction_processing':
                return 'bg-blue-100 text-blue-800';
            case 'waiting':
            default:
                return 'bg-yellow-100 text-yellow-800';
        }
    };

    const calculateProgress = () => {
        if (jobStats.total === 0) return 0;
        return Math.round(((jobStats.completed + jobStats.failed) / jobStats.total) * 100);
    };

    const getGraphExtractionProgress = () => {
        if (!documentStatus?.processing_metadata?.graphExtraction) return null;

        const ge = documentStatus.processing_metadata.graphExtraction;
        const segmentsProcessed = ge.segmentsProcessed || 0;
        const totalSegments = ge.totalSegments || 0;

        if (totalSegments === 0) return null;

        return {
            segmentsProcessed,
            totalSegments,
            percentage: Math.round((segmentsProcessed / totalSegments) * 100),
            nodesCreated: ge.nodesCreated || 0,
            edgesCreated: ge.edgesCreated || 0,
        };
    };

    const graphProgress = getGraphExtractionProgress();

    return (
        <div className={`space-y-4 ${className}`}>
            {/* Job Stats Card */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Job Progress</CardTitle>
                    <div className="flex items-center space-x-2">
                        {isLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
                        {lastUpdated && (
                            <span className="text-xs text-muted-foreground">
                                Updated {lastUpdated.toLocaleTimeString()}
                            </span>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {/* Progress Bar */}
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span>Overall Progress</span>
                                <span>{calculateProgress()}%</span>
                            </div>
                            <Progress value={calculateProgress()} className="h-2" />
                        </div>

                        {/* Job Counts */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">Total Jobs</span>
                                    <Badge variant="outline">{jobStats.total}</Badge>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">Waiting</span>
                                    <Badge variant="outline" className="text-yellow-600">
                                        {jobStats.waiting}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">Active</span>
                                    <Badge variant="outline" className="text-blue-600">
                                        {jobStats.active}
                                    </Badge>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">Completed</span>
                                    <Badge variant="outline" className="text-green-600">
                                        {jobStats.completed}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">Failed</span>
                                    <Badge variant="outline" className="text-red-600">
                                        {jobStats.failed}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Document Status Card */}
            {documentStatus && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium">Document Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{documentStatus.name}</span>
                                <div className="flex items-center space-x-2">
                                    {getStatusIcon(documentStatus.indexing_status)}
                                    <Badge className={getStatusColor(documentStatus.indexing_status)}>
                                        {documentStatus.indexing_status.replace('_', ' ')}
                                    </Badge>
                                </div>
                            </div>

                            {/* Graph Extraction Progress */}
                            {graphProgress && (
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span>Graph Extraction Progress</span>
                                        <span>{graphProgress.percentage}%</span>
                                    </div>
                                    <Progress value={graphProgress.percentage} className="h-2" />
                                    <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
                                        <div>
                                            Segments: {graphProgress.segmentsProcessed}/{graphProgress.totalSegments}
                                        </div>
                                        <div>Nodes: {graphProgress.nodesCreated}</div>
                                        <div>Edges: {graphProgress.edgesCreated}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

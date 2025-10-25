'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNotifications, WorkflowExecutionNotification } from '@/lib/hooks/use-notifications';
import { CheckCircle, XCircle, Clock, Wifi, WifiOff } from 'lucide-react';

interface WorkflowExecutionNotificationsProps {
    workflowId?: string;
    executionId?: string;
    onExecutionUpdate?: (notification: WorkflowExecutionNotification) => void;
}

export function WorkflowExecutionNotifications({
    workflowId,
    executionId,
    onExecutionUpdate,
}: WorkflowExecutionNotificationsProps) {
    const {
        isConnected,
        getWorkflowNotifications,
        getExecutionNotifications,
        getLatestExecutionStatus
    } = useNotifications();

    const [notifications, setNotifications] = useState<WorkflowExecutionNotification[]>([]);

    useEffect(() => {
        if (workflowId) {
            const workflowNotifications = getWorkflowNotifications(workflowId);
            setNotifications(workflowNotifications.map(n => n.data));
        } else if (executionId) {
            const executionNotifications = getExecutionNotifications(executionId);
            setNotifications(executionNotifications.map(n => n.data));
        }
    }, [workflowId, executionId, getWorkflowNotifications, getExecutionNotifications]);

    // Call the callback when execution updates
    useEffect(() => {
        if (executionId && onExecutionUpdate) {
            const latestStatus = getLatestExecutionStatus(executionId);
            if (latestStatus) {
                onExecutionUpdate(latestStatus);
            }
        }
    }, [executionId, onExecutionUpdate, getLatestExecutionStatus]);

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed':
                return <CheckCircle className="h-4 w-4 text-green-500" />;
            case 'failed':
                return <XCircle className="h-4 w-4 text-red-500" />;
            case 'running':
                return <Clock className="h-4 w-4 text-blue-500" />;
            default:
                return <Clock className="h-4 w-4 text-gray-500" />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed':
                return 'bg-green-100 text-green-800';
            case 'failed':
                return 'bg-red-100 text-red-800';
            case 'running':
                return 'bg-blue-100 text-blue-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <Card className="w-full">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            {isConnected ? (
                                <Wifi className="h-5 w-5 text-green-500" />
                            ) : (
                                <WifiOff className="h-5 w-5 text-red-500" />
                            )}
                            Real-time Notifications
                        </CardTitle>
                        <CardDescription>
                            {isConnected
                                ? 'Connected to notification stream'
                                : 'Disconnected - attempting to reconnect...'
                            }
                        </CardDescription>
                    </div>
                    <Badge className={isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                        {isConnected ? 'Connected' : 'Disconnected'}
                    </Badge>
                </div>
            </CardHeader>

            <CardContent>
                {notifications.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                        <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                        <p>No notifications yet</p>
                        <p className="text-sm">Workflow execution updates will appear here</p>
                    </div>
                ) : (
                    <div className="space-y-4 max-h-96 overflow-y-auto">
                        {notifications.map((notification, index) => (
                            <div
                                key={`${notification.executionId}-${index}`}
                                className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50"
                            >
                                <div className="flex-shrink-0 mt-1">
                                    {getStatusIcon(notification.status)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Badge className={getStatusColor(notification.status)}>
                                            {notification.status}
                                        </Badge>
                                        <span className="text-xs text-gray-500">
                                            {notification.executionId.slice(0, 8)}...
                                        </span>
                                    </div>
                                    <p className="text-sm font-medium">{notification.message}</p>
                                    {notification.currentNode && (
                                        <p className="text-xs text-gray-600">
                                            Current node: {notification.currentNode}
                                        </p>
                                    )}
                                    {notification.duration && (
                                        <p className="text-xs text-gray-600">
                                            Duration: {Math.round(notification.duration / 1000)}s
                                        </p>
                                    )}
                                    {notification.error && (
                                        <p className="text-xs text-red-600">
                                            Error: {notification.error}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// Example usage component
export function WorkflowExecutionMonitor({ workflowId }: { workflowId: string }) {
    const [executionStatus, setExecutionStatus] = useState<WorkflowExecutionNotification | null>(null);

    const handleExecutionUpdate = (notification: WorkflowExecutionNotification) => {
        setExecutionStatus(notification);
        console.log('Execution updated:', notification);
    };

    return (
        <div className="space-y-4">
            <WorkflowExecutionNotifications
                workflowId={workflowId}
                onExecutionUpdate={handleExecutionUpdate}
            />

            {executionStatus && (
                <Card>
                    <CardHeader>
                        <CardTitle>Latest Execution Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <pre className="text-sm bg-gray-100 p-3 rounded">
                            {JSON.stringify(executionStatus, null, 2)}
                        </pre>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

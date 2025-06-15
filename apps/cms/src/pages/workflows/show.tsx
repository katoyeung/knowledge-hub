import { Show, TextField, DateField, TagField } from "@refinedev/antd";
import { useShow } from "@refinedev/core";
import { Typography, Card, Descriptions, Tabs, Space, Row, Col, List, Spin, Button, notification, Collapse, Input } from "antd";
import type { DescriptionsProps } from 'antd';
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import ReactJson from 'react-json-view';
import axiosInstance from "../../utils/axiosInstance";
import { HttpError } from "@refinedev/core";
import { CheckCircleFilled, CloseCircleFilled, PlayCircleOutlined, DownloadOutlined } from '@ant-design/icons';
import cronstrue from 'cronstrue';

const { Title, Text } = Typography;

// Define interfaces for nested data structures based on the provided JSON
interface User {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
  updatedAt: string;
}

interface TriggerConfig {
  cron?: string;
  // Add other potential trigger config fields if necessary
}

interface Node {
  id: string;
  name: string;
  description?: string;
  type: string;
  position: number;
  parameters: Record<string, any>;
  connections: any;
  createdAt: string;
  updatedAt: string;
  workflowId: string;
}

interface NodeExecutionDetail {
  id: string;
  nodeId: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  input: Record<string, any> | null;
  output: Record<string, any> | null;
  error?: any;
}

interface Execution {
  id: string;
  status: string;
  triggerType: string;
  startedAt: string;
  completedAt?: string;
  input: Record<string, any> | null;
  output: Record<string, any> | null;
  error?: any;
  workflowId: string;
  triggeredById: string;
  createdAt: string;
  updatedAt: string;
  // The detailed data is now fetched separately
  nodeExecutions?: NodeExecutionDetail[];
}

interface WorkflowData {
  id: string;
  name: string;
  status: string;
  triggerType: string;
  triggerConfig: TriggerConfig | null;
  createdBy: User;
  createdById: string;
  nodes: Node[];
  executions: Execution[];
  createdAt: string;
  updatedAt: string;
}

// New interface for execution details from API
interface ExecutionDetailResponse {
  id: string;
  status: string;
  triggerType: string;
  startedAt: string;
  completedAt?: string;
  input: Record<string, any> | null;
  output: Record<string, any> | null;
  error?: any;
  workflow: {
    id: string;
    name: string;
    status: string;
    triggerType: string;
    triggerConfig: TriggerConfig | null;
    createdById: string;
    createdAt: string;
    updatedAt: string;
  };
  workflowId: string;
  triggeredBy: User;
  triggeredById: string;
  nodeExecutions: NodeExecutionDetail[];
}

// Function to get human-readable cron description
const getCronDescription = (cron: string) => {
  try {
    return cronstrue.toString(cron);
  } catch (error) {
    console.error("Error parsing cron expression:", error);
    return cron; // Return the original expression if parsing fails
  }
};

export const WorkflowShow = () => {
  const { query: { data, isLoading, refetch } } = useShow<WorkflowData>();

  const record = data?.data;

  // --- State for New Layout ---
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);
  const userRecentlySelectedNodeRef = useRef(false); // Moved from lower down, ensure it's defined before use

  // New state for execution details
  const [executionDetails, setExecutionDetails] = useState<ExecutionDetailResponse | null>(null);
  const executionDetailsRef = useRef(executionDetails); // Ref to hold current executionDetails

  // Keep ref updated with the latest executionDetails
  useEffect(() => {
    executionDetailsRef.current = executionDetails;
  }, [executionDetails]);

  const [loadingDetails, setLoadingDetails] = useState(false);

  // Memoize sorted nodes and executions
  const sortedNodes = useMemo(() => {
    return record?.nodes?.slice().sort((a, b) => a.position - b.position) ?? [];
  }, [record?.nodes]);

  const sortedExecutions = useMemo(() => {
    return record?.executions?.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) ?? [];
  }, [record?.executions]);

  // --- Effects to set initial selections ---
  useEffect(() => {
    // Select the latest execution by default if not already selected
    if (!selectedExecutionId && sortedExecutions.length > 0) {
      setSelectedExecutionId(sortedExecutions[0].id);
    }
  }, [sortedExecutions, selectedExecutionId]);

  useEffect(() => {
    // Select the first node by default if not already selected
    if (!selectedNodeId && sortedNodes.length > 0) {
      setSelectedNodeId(sortedNodes[0].id);
    }
  }, [sortedNodes, selectedNodeId]);

  // --- Find selected execution summary data ---
  const selectedExecutionSummary = useMemo(() => {
    return sortedExecutions.find(exec => exec.id === selectedExecutionId);
  }, [sortedExecutions, selectedExecutionId]);

  const selectedNodeData = useMemo(() => {
    return sortedNodes.find(node => node.id === selectedNodeId);
  }, [sortedNodes, selectedNodeId]);

  // Function to fetch execution details
  const fetchExecutionDetails = useCallback(async (executionId: string, isBackgroundRefresh: boolean = false): Promise<ExecutionDetailResponse | null> => {
    const currentExecutionDetails = executionDetailsRef.current; // Read from ref
    // Determine if loader should be shown for this specific call
    const shouldShowLoader = !isBackgroundRefresh || !currentExecutionDetails || currentExecutionDetails.id !== executionId;

    if (shouldShowLoader) {
      setLoadingDetails(true);
    }

    try {
      const response = await axiosInstance.get<ExecutionDetailResponse>(`/workflow-executions/${executionId}`);
      setExecutionDetails(response.data); // This updates state and will trigger re-render
      return response.data;
    } catch (error) {
      console.error("Error fetching execution details:", error);
      const httpError = error as HttpError;
      notification.error({
        message: "Failed to fetch execution details",
        description: httpError.message || "An unexpected error occurred.",
      });
      setExecutionDetails(null);
      // if (shouldShowLoader) setLoadingDetails(false); // Covered by finally, but good to be explicit on error path too
      return null;
    } finally {
      // Only set loading to false if we had previously set it to true in *this* call.
      if (shouldShowLoader) {
        setLoadingDetails(false);
      }
    }
  }, [setLoadingDetails, setExecutionDetails]); // Dependencies are stable setter functions

  // New effect to fetch execution details when selectedExecutionId changes
  useEffect(() => {
    if (selectedExecutionId) {
      // Only fetch if:
      // 1. We don't have any execution details loaded yet (executionDetailsRef.current is null)
      // OR
      // 2. The loaded details are for a *different* executionId.
      // This prevents re-fetching if a background update just occurred for the same ID.
      if (!executionDetailsRef.current || executionDetailsRef.current.id !== selectedExecutionId) {
        fetchExecutionDetails(selectedExecutionId, false); // false: this is a foreground fetch, show loader
      }
    } else {
      setExecutionDetails(null); // Clear details if no execution is selected
      setLoadingDetails(false);  // Ensure loader is off
    }
    userRecentlySelectedNodeRef.current = false; // Reset flag when execution context changes
  }, [selectedExecutionId, fetchExecutionDetails]); // fetchExecutionDetails reference is now stable

  // Get node execution details for the selected node
  const selectedNodeExecution = useMemo(() => {
    if (!executionDetails?.nodeExecutions || !selectedNodeId) return null;
    return executionDetails.nodeExecutions.find(
      nodeExec => nodeExec.nodeId === selectedNodeId
    );
  }, [executionDetails, selectedNodeId]);

  // Common props for ReactJson for consistency
  const jsonViewProps = {
    theme: "rjv-default",
    collapsed: false,
    displayDataTypes: false,
    enableClipboard: true,
    style: {
      padding: '10px',
      borderRadius: '4px',
      background: '#f5f5f5',
      fontSize: '12px',
      wordBreak: 'break-all'
    }
  };

  const enhancedJsonViewProps = {
    ...jsonViewProps,
    collapsed: 1,
    collapseStringsAfterLength: 100,
    groupArraysAfterLength: 100,
    displayObjectSize: true,
    shouldCollapse: (field) => {
      return (
        (Array.isArray(field.src) && field.src.length > 10) ||
        (typeof field.src === 'object' && field.src !== null && Object.keys(field.src).length > 10)
      );
    }
  };

  const nodeItems = (node: Node): DescriptionsProps['items'] => {
    return [
      {
        key: `action_run_${node.id}`,
        label: "Actions",
        children: (
          <Button
            icon={<PlayCircleOutlined />}
            size="small"
            type="primary"
            onClick={() => handleRunNode(record?.id, node.id, node.name)}
            disabled={
              !record ||
              record.status === 'archived' ||
              record.status === 'disabled' ||
              selectedExecutionSummary?.status === 'running' // Disable if any execution is currently running
            }
          >
            Run Node
          </Button>
        ),
        span: 1, // Ensures it takes the full width in a 1-column layout
      },
      { key: '1', label: 'ID', children: <Text copyable code>{node.id}</Text> },
      { key: '2', label: 'Type', children: <TagField value={node.type} /> },
      { key: '3', label: 'Position', children: <TextField value={node.position} /> },
      { key: '4', label: 'Description', children: <TextField value={node.description ?? '-'} /> },
      { key: '5', label: 'Parameters', children: node.parameters ? <ReactJson src={node.parameters} {...jsonViewProps} name={false} /> : '-' },
      { key: '6', label: 'Created At', children: <DateField value={node.createdAt} format="YYYY-MM-DD HH:mm:ss" /> },
      { key: '7', label: 'Updated At', children: <DateField value={node.updatedAt} format="YYYY-MM-DD HH:mm:ss" /> },
      { key: '8', label: 'Connections', children: node.connections ? <ReactJson src={node.connections} {...jsonViewProps} name={false} /> : '-' }
    ];
  };

  // Helper function to calculate and format elapsed time
  const calculateElapsedTime = (start: string | undefined, end: string | undefined): string => {
    if (!start || !end) return "-";
    try {
      const startDate = new Date(start);
      const endDate = new Date(end);
      const diffMs = endDate.getTime() - startDate.getTime();
      if (diffMs < 0) return "Invalid dates";

      const diffSec = diffMs / 1000;
      if (diffSec < 60) return `${diffSec.toFixed(2)}s`;
      const diffMin = diffSec / 60;
      if (diffMin < 60) return `${diffMin.toFixed(2)}m`;
      const diffHr = diffMin / 60;
      return `${diffHr.toFixed(2)}h`;
    } catch (e) {
      return "Error";
    }
  };

  const getStatusText = (status: string | undefined, startedAt: string | undefined, completedAt: string | undefined): string => {
    const elapsedTime = calculateElapsedTime(startedAt, completedAt);
    let statusStr = "";

    if (status === 'completed') {
      statusStr = "Succeeded";
    } else if (status === 'failed') {
      statusStr = "Failed";
    } else if (status === 'pending' || status === 'running' || status === 'queued') {
      statusStr = status.charAt(0).toUpperCase() + status.slice(1);
    } else if (status) {
      statusStr = status.charAt(0).toUpperCase() + status.slice(1); // Capitalize first letter
    } else {
      return "Status unknown";
    }

    if (elapsedTime && elapsedTime !== "-") {
      return `${statusStr} in ${elapsedTime}`;
    }
    return statusStr;
  };

  useEffect(() => {
    // Ensure fetchExecutionDetails is stable, e.g., wrapped in useCallback if defined in component scope
    // For this example, assuming it's stable or defined outside.

    if (selectedExecutionSummary?.status === 'running') {
      // Clear any existing interval before setting a new one
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }

      const interval = setInterval(async () => {
        // 1. Refresh the main workflow data to get the latest list of executions
        const { data: updatedData } = await refetch();

        let detailsFetchedThisInterval: ExecutionDetailResponse | null = null;
        // `selectedExecutionId` here is from the closure (value at the time interval was set up or from the last render)
        // This fetch is for the execution that was selected/focused at the start of *this* interval tick.
        // It also updates the global `executionDetails` state via `setExecutionDetails` in `fetchExecutionDetails`.
        if (selectedExecutionId) {
          detailsFetchedThisInterval = await fetchExecutionDetails(selectedExecutionId, true); // Pass true for background refresh
        }

        if (updatedData?.data?.executions && updatedData.data.executions.length > 0) {
          const newSortedExecutions = [...updatedData.data.executions]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

          const latestExecutionInList = newSortedExecutions[0];

          // 2. Update the selectedExecutionId state to always point to the truly latest one from the list.
          // This will trigger the other useEffect (listening to selectedExecutionId changes)
          // to fetch details if latestExecutionInList.id is different from the current selectedExecutionId.
          setSelectedExecutionId(latestExecutionInList.id);

          // 3. Check if this latest execution is still running.
          if (latestExecutionInList.status !== 'running') {
            clearInterval(interval); // Stop polling
            setRefreshInterval(null);

            let finalDetailsForNodeSelection: ExecutionDetailResponse | null = null;

            // Can we reuse the details fetched at the start of this interval?
            // Yes, if:
            // a) They are for the same execution that just finished (latestExecutionInList).
            // b) Those fetched details (`detailsFetchedThisInterval`) already show a non-running status.
            if (detailsFetchedThisInterval &&
              detailsFetchedThisInterval.id === latestExecutionInList.id &&
              detailsFetchedThisInterval.status !== 'running') {
              finalDetailsForNodeSelection = detailsFetchedThisInterval;
              // console.log("Reusing details fetched within the interval for completed execution:", latestExecutionInList.id);
            } else {
              // Otherwise, fetch fresh, definitive final details for the execution that just completed.
              // This is necessary if:
              // - `selectedExecutionId` (at interval start) was different from `latestExecutionInList.id`.
              // - Or, `detailsFetchedThisInterval` was for `latestExecutionInList.id`, but was fetched while it was still 'running'.
              // - Or, `selectedExecutionId` was null at the start.
              // console.log("Fetching fresh final details for completed execution:", latestExecutionInList.id);
              finalDetailsForNodeSelection = await fetchExecutionDetails(latestExecutionInList.id, true);
            }

            // Now, use finalDetailsForNodeSelection to determine the node tab to select.
            let nodeIdToSelect: string | null = null;
            if (finalDetailsForNodeSelection && finalDetailsForNodeSelection.nodeExecutions && finalDetailsForNodeSelection.nodeExecutions.length > 0) {
              const sortedNodeExecs = [...finalDetailsForNodeSelection.nodeExecutions].sort(
                (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
              );
              if (sortedNodeExecs.length > 0) {
                nodeIdToSelect = sortedNodeExecs[sortedNodeExecs.length - 1].nodeId;
              }
            }

            if (nodeIdToSelect) {
              setSelectedNodeId(nodeIdToSelect);
            } else if (sortedNodes.length > 0) {
              // Fallback: if no specific executed node, select the last node by position.
              setSelectedNodeId(sortedNodes[sortedNodes.length - 1].id);
            }
            // If sortedNodes is empty, selectedNodeId remains as is.
          }
          // If latestExecutionInList.status IS 'running', the loop continues.
          // The `setSelectedExecutionId(latestExecutionInList.id)` call above, if it changed the ID,
          // will have triggered the other useEffect to update `executionDetails` state.
          // If the ID didn't change, `detailsFetchedThisInterval` already refreshed its details.
        } else {
          // No executions found in the updated data, stop polling.
          clearInterval(interval);
          setRefreshInterval(null);
        }
      }, 1000);

      setRefreshInterval(interval);
    } else {
      // selectedExecutionSummary.status is not 'running', so clear any existing interval.
      if (refreshInterval) {
        clearInterval(refreshInterval);
        setRefreshInterval(null);
      }
    }

    // Cleanup function for the effect: clear interval when component unmounts or dependencies change.
    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
    // Dependencies for this effect:
    // - selectedExecutionSummary?.status: To start/stop polling.
    // - refetch: The function to get updated data.
    // - selectedExecutionId: Used to fetch details at the start of the interval for the "current" selection.
    // - sortedNodes: Used as a fallback for selecting a node.
    // - fetchExecutionDetails: The function used for fetching. (Ensure this is stable, e.g., via useCallback)
  }, [selectedExecutionSummary?.status, refetch, selectedExecutionId, sortedNodes, fetchExecutionDetails]);

  // Combined Effect for Auto-Node-Selection and User Lock Management
  useEffect(() => {
    const currentExecDetails = executionDetailsRef.current; // Use the ref for latest details

    if (!currentExecDetails) {
      userRecentlySelectedNodeRef.current = false; // No details, no lock.
      return;
    }

    const isExecutionRunning = currentExecDetails.status === 'running';
    let actualRunningNodeId: string | null = null;

    if (isExecutionRunning && currentExecDetails.nodeExecutions) {
      actualRunningNodeId =
        currentExecDetails.nodeExecutions
          .slice() // Create a copy before sorting
          .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()) // Latest started first
          .find(nodeExec => !nodeExec.completedAt)?.nodeId || null;
    }

    if (!isExecutionRunning) {
      // Execution is not running (e.g. completed, failed, pending), release any user lock.
      userRecentlySelectedNodeRef.current = false;
      return; // Don't auto-select if not actively running.
    }

    // Execution IS running.
    if (userRecentlySelectedNodeRef.current) {
      // User has an active selection "lock".
      // If their selected node is the one that's actually running, they've caught up, so release the lock.
      if (selectedNodeId === actualRunningNodeId) {
        userRecentlySelectedNodeRef.current = false;
      } else {
        // User has selected a node different from the currently running one.
        // Respect their choice, do not auto-select.
        return;
      }
    }

    // If we reach here, it means:
    // 1. Execution is running.
    // 2. EITHER userRecentlySelectedNodeRef.current was false (no lock)
    //    OR it was true, but selectedNodeId matched actualRunningNodeId, so lock was just released.
    // Therefore, we are allowed to auto-select.
    if (actualRunningNodeId && actualRunningNodeId !== selectedNodeId) {
      setSelectedNodeId(actualRunningNodeId);
    }
  }, [executionDetails, selectedNodeId, setSelectedNodeId]); // Dependencies

  const handleRunWorkflow = async () => {
    if (!record?.id) {
      notification.error({ message: "Workflow ID not found." });
      return;
    }
    setIsRunning(true);

    try {
      await axiosInstance.post(`/workflows/${record.id}/run`, {});
      // Wait for refetch to complete and get the updated data
      const { data: updatedData } = await refetch();

      if (updatedData?.data?.executions) {
        // Sort the newly fetched executions to find the latest one
        const newSortedExecutions = [...updatedData.data.executions]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        if (newSortedExecutions.length > 0) {
          setSelectedExecutionId(newSortedExecutions[0].id);
        }
      }

    } catch (error) {
      console.error("Error running workflow:", error);
      const httpError = error as HttpError;
      notification.error({
        message: "Failed to start workflow execution",
        description: httpError.message || "An unexpected error occurred.",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunNode = async (workflowId: string | undefined, nodeId: string | undefined, nodeName: string | undefined) => {
    if (!workflowId || !nodeId) {
      notification.error({ message: "Workflow ID or Node ID not found." });
      return;
    }

    try {
      await axiosInstance.post(`/workflows/${workflowId}/nodes/${nodeId}/run`, {});
      notification.success({
        message: `Node "${nodeName || nodeId}" run triggered`,
        description: "The workflow data will be refreshed.",
      });

      // Wait for refetch to complete and get the updated data
      const { data: updatedData } = await refetch();

      if (updatedData?.data?.executions) {
        // Sort the newly fetched executions to find the latest one
        const newSortedExecutions = [...updatedData.data.executions]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        if (newSortedExecutions.length > 0) {
          setSelectedExecutionId(newSortedExecutions[0].id);
        }
      }
    } catch (error) {
      console.error(`Error running node ${nodeId}:`, error);
      const httpError = error as HttpError;
      notification.error({
        message: `Failed to run node "${nodeName || nodeId}"`,
        description: httpError.message || "An unexpected error occurred.",
      });
    }
  };

  const [showFullOutput, setShowFullOutput] = useState(false);

  // Helper function to determine if data is "large"
  const isLargeData = (data: any): boolean => {
    if (!data) return false;

    if (Array.isArray(data)) {
      return data.length > 1000;
    }

    if (typeof data === 'object') {
      // Check if the JSON string representation is large
      try {
        return JSON.stringify(data).length > 10000;
      } catch (e) {
        return false;
      }
    }

    return false;
  };

  const [searchTerm, setSearchTerm] = useState("");

  // Function to filter JSON data based on search term
  const filterJson = (data: any, term: string) => {
    if (!term || term.length < 3) return data;

    if (Array.isArray(data)) {
      return data.filter(item =>
        JSON.stringify(item).toLowerCase().includes(term.toLowerCase())
      );
    }

    if (typeof data === 'object' && data !== null) {
      const result = {};
      Object.entries(data).forEach(([key, value]) => {
        if (key.toLowerCase().includes(term.toLowerCase()) ||
          JSON.stringify(value).toLowerCase().includes(term.toLowerCase())) {
          result[key] = value;
        }
      });
      return result;
    }

    return data;
  };

  const downloadJson = (data, filename = 'data.json') => {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const href = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
  };

  if (isLoading) {
    return <Show isLoading={isLoading}><Spin /></Show>;
  }

  if (!record) {
    return <Show isLoading={false}><Text>Workflow data not found.</Text></Show>;
  }

  const nodeTabItems = sortedNodes.map(node => {
    // Find the node execution for this node if available
    const nodeExecution = executionDetails?.nodeExecutions?.find(
      ne => ne.nodeId === node.id
    );

    let statusIcon = null;

    if (nodeExecution) {
      if (nodeExecution.status === 'completed' || nodeExecution.status === 'success') {
        statusIcon = <CheckCircleFilled style={{ color: '#52c41a', marginLeft: 8 }} />;
      } else if (nodeExecution.status === 'failed') {
        statusIcon = <CloseCircleFilled style={{ color: '#ff4d4f', marginLeft: 8 }} />;
      } else if (nodeExecution.status === 'running') {
        statusIcon = <Spin size="small" style={{ marginLeft: 8 }} />;
      }
    }

    return {
      key: node.id,
      label: (
        <Space>
          {`${node.position}. ${node.name}`}
          {statusIcon}
        </Space>
      ),
      children: (
        <Descriptions layout="vertical" bordered column={1} size="small" items={nodeItems(node)} />
      ),
    };
  });

  return (
    <Show isLoading={isLoading} title={record?.name.slice(0, 70) + (record?.name.length > 70 ? '...' : '')}>
      <Descriptions bordered column={2} size="small" style={{ marginBottom: 20 }}>
        <Descriptions.Item label="ID"><Text copyable code>{record?.id}</Text></Descriptions.Item>
        <Descriptions.Item label="Status">
          <TagField
            value={record?.status}
            color={record?.status === 'active' ? 'green' :
              record?.status === 'inactive' ? 'volcano' :
                'default'}
          />
        </Descriptions.Item>
        <Descriptions.Item label="Trigger Type">
          {record?.triggerType === 'schedule' && record?.triggerConfig?.cron ? (
            <Space>
              <TagField
                value={record.triggerType}
                color="blue"
              />
              <Text type="secondary">({getCronDescription(record.triggerConfig.cron)})</Text>
            </Space>
          ) : (
            <TagField
              value={record?.triggerType}
              color={record?.triggerType === 'manual' ? 'purple' : 'default'}
            />
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Created At"><DateField value={record?.createdAt} format="YYYY-MM-DD HH:mm:ss" /></Descriptions.Item>
        <Descriptions.Item label="Updated At"><DateField value={record?.updatedAt} format="YYYY-MM-DD HH:mm:ss" /></Descriptions.Item>
      </Descriptions>

      <Space style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 10 }}>
        <Title level={4} style={{ margin: 0 }}>Executions</Title>
        <Button
          type="primary"
          onClick={handleRunWorkflow}
          loading={isRunning}
          disabled={!record || record.status === 'archived' || record.status === 'disabled'}
        >
          Run Workflow
        </Button>
      </Space>

      <Row gutter={16}>
        <Col span={4}>
          <Title level={5}>Execution Runs</Title>
          {sortedExecutions.length > 0 ? (
            <List
              size="small"
              bordered
              dataSource={sortedExecutions}
              renderItem={exec => (
                <List.Item
                  key={exec.id}
                  onClick={() => setSelectedExecutionId(exec.id)}
                  style={{
                    cursor: 'pointer',
                    backgroundColor: selectedExecutionId === exec.id ? '#d6e4ff' : undefined,
                    padding: '8px 12px'
                  }}
                >
                  <List.Item.Meta
                    title={
                      <Space size="small">
                        <TagField
                          value={exec.status}
                          color={exec.status === 'completed' ? 'green' : exec.status === 'failed' ? 'volcano' : 'blue'}
                        />
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size={0} style={{ fontSize: '11px' }}>
                        <DateField value={exec.startedAt} format="YYYY-MM-DD HH:mm:ss" />
                        <Text type="secondary">{getStatusText(exec.status, exec.startedAt, exec.completedAt)}</Text>
                      </Space>
                    }
                  />
                </List.Item>
              )}
              style={{ maxHeight: '60vh', overflowY: 'auto' }}
            />
          ) : (
            <Text italic>No executions found for this workflow.</Text>
          )}
        </Col>

        <Col span={9}>
          <Title level={5}>Workflow Nodes</Title>
          {nodeTabItems.length > 0 ? (
            <Tabs
              size="small"
              activeKey={selectedNodeId}
              onChange={(newKey) => {
                setSelectedNodeId(newKey);
                userRecentlySelectedNodeRef.current = true;
              }}
              items={nodeTabItems}
              style={{ border: '1px solid #d9d9d9', borderRadius: '4px', padding: '0 8px' }}
            />
          ) : (
            <Text italic>No nodes found for this workflow.</Text>
          )}
        </Col>

        <Col span={9}>
          <Title level={5}>Execution Details & Output</Title>
          {loadingDetails ? (
            <Spin />
          ) : executionDetails ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              {selectedNodeData && selectedNodeExecution && (
                <>
                  {/* Node Execution details are collapsible and moved to top */}
                  <Collapse
                    size="small"

                  >
                    <Collapse.Panel
                      header={`Node Execution: ${selectedNodeData.position}. ${selectedNodeData.name}`}
                      key="1"
                    >
                      <Descriptions layout="vertical" bordered column={1} size="small">
                        <Descriptions.Item label="ID"><Text copyable code>{selectedNodeExecution.id}</Text></Descriptions.Item>
                        <Descriptions.Item label="Status">
                          <TagField
                            value={selectedNodeExecution.status}
                            color={selectedNodeExecution.status === 'completed' || selectedNodeExecution.status === 'success' ? 'green' : 'volcano'}
                          />
                        </Descriptions.Item>
                        <Descriptions.Item label="Started At">
                          <DateField value={selectedNodeExecution.startedAt} format="YYYY-MM-DD HH:mm:ss" />
                        </Descriptions.Item>
                        {selectedNodeExecution.completedAt && (
                          <Descriptions.Item label="Completed At">
                            <DateField value={selectedNodeExecution.completedAt} format="YYYY-MM-DD HH:mm:ss" />
                          </Descriptions.Item>
                        )}
                        <Descriptions.Item label="Duration">
                          <Text>{calculateElapsedTime(selectedNodeExecution.startedAt, selectedNodeExecution.completedAt)}</Text>
                        </Descriptions.Item>
                        {selectedNodeExecution.input && (
                          <Descriptions.Item label="Input">
                            <ReactJson src={selectedNodeExecution.input} {...jsonViewProps} collapsed={1} name={false} />
                          </Descriptions.Item>
                        )}
                      </Descriptions>
                    </Collapse.Panel>
                  </Collapse>

                  {selectedNodeExecution.output && (
                    <Card size="small" title="Output">
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                        {selectedNodeExecution.output && (
                          <Input.Search
                            placeholder="Search in JSON data"
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ flex: 1, marginRight: 8 }}
                            allowClear
                          />
                        )}
                        {selectedNodeExecution.output && (
                          <Button
                            type="default"
                            size="small"
                            icon={<DownloadOutlined />}
                            onClick={() => downloadJson(selectedNodeExecution.output, `node-output-${selectedNodeExecution.id}.json`)}
                          >
                            Download
                          </Button>
                        )}
                      </div>

                      {selectedNodeExecution.output && (
                        <ReactJson
                          src={searchTerm.length >= 3
                            ? filterJson(selectedNodeExecution.output, searchTerm)
                            : selectedNodeExecution.output}
                          {...enhancedJsonViewProps}
                          name={false}
                        />
                      )}
                    </Card>
                  )}

                  {selectedNodeExecution.error && (
                    <Card size="small" title="Error">
                      <pre>{selectedNodeExecution.error}</pre>
                    </Card>
                  )}
                </>
              )}
              {!selectedNodeData && (
                <Text italic>Select a node from the middle column to view its execution details.</Text>
              )}
              <Collapse size="small">
                <Collapse.Panel header={`Execution: ${executionDetails.id}`} key="1">
                  <Descriptions layout="vertical" bordered column={1} size="small">
                    <Descriptions.Item label="Status">
                      <TagField
                        value={executionDetails.status}
                        color={executionDetails.status === 'completed' ? 'green' : executionDetails.status === 'failed' ? 'volcano' : 'blue'}
                      />
                    </Descriptions.Item>
                    <Descriptions.Item label="Started At">
                      <DateField value={executionDetails.startedAt} format="YYYY-MM-DD HH:mm:ss" />
                    </Descriptions.Item>
                    {executionDetails.completedAt && (
                      <Descriptions.Item label="Completed At">
                        <DateField value={executionDetails.completedAt} format="YYYY-MM-DD HH:mm:ss" />
                      </Descriptions.Item>
                    )}
                    {executionDetails.input && Object.keys(executionDetails.input).length > 0 && (
                      <Descriptions.Item label="Input">
                        <ReactJson src={executionDetails.input} {...jsonViewProps} name={false} />
                      </Descriptions.Item>
                    )}
                    {executionDetails.output && (
                      <Descriptions.Item label="Output">
                        {showFullOutput || !isLargeData(executionDetails.output) ? (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                              <Button
                                type="default"
                                size="small"
                                icon={<DownloadOutlined />}
                                onClick={() => downloadJson(executionDetails.output, `execution-output-${executionDetails.id}.json`)}
                              >
                                Download JSON
                              </Button>
                            </div>
                            <ReactJson
                              src={executionDetails.output}
                              {...enhancedJsonViewProps}
                              name={false}
                            />
                          </>
                        ) : (
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text>Large data preview:</Text>
                              <Button
                                type="default"
                                size="small"
                                icon={<DownloadOutlined />}
                                onClick={() => downloadJson(executionDetails.output, `execution-output-${executionDetails.id}.json`)}
                              >
                                Download JSON
                              </Button>
                            </div>
                            <div style={{ margin: '10px 0' }}>
                              {Array.isArray(executionDetails.output) ? (
                                <ReactJson
                                  src={executionDetails.output.slice(0, 5)}
                                  {...enhancedJsonViewProps}
                                  name={false}
                                />
                              ) : (
                                <ReactJson
                                  src={Object.fromEntries(
                                    Object.entries(executionDetails.output || {})
                                      .slice(0, 5)
                                  )}
                                  {...enhancedJsonViewProps}
                                  name={false}
                                />
                              )}
                            </div>
                            <Button
                              type="primary"
                              size="small"
                              onClick={() => setShowFullOutput(true)}
                              style={{ marginTop: 10 }}
                            >
                              Load Full Data
                            </Button>
                          </div>
                        )}
                      </Descriptions.Item>
                    )}
                  </Descriptions>
                  {executionDetails.error && (
                    <Card size="small" title="Error">
                      <pre>{executionDetails.error}</pre>
                    </Card>
                  )}
                </Collapse.Panel>
              </Collapse>
            </Space>
          ) : (
            <Text italic>Select an execution from the list on the left.</Text>
          )}
        </Col>
      </Row>
    </Show>
  );
};

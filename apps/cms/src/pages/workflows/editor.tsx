import { useState, useCallback, useEffect, useRef } from "react";
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  ReactFlowProvider,
  Node,
  Edge,
  Handle,
  Position,
  NodeProps,
  ReactFlowInstance,
  PanOnScrollMode,
  ConnectionLineType,
  SelectionMode,
} from "reactflow";
import { useParams } from "react-router-dom";
import { useShow, useResource } from "@refinedev/core";
import { Card, Spin, Typography } from "antd";
import {
  ApiOutlined,
  AppstoreOutlined,
  SettingOutlined,
  DatabaseOutlined
} from '@ant-design/icons';

import "reactflow/dist/style.css";

// Define an interface for your workflow node data from the API
interface WorkflowNodeAPI {
  id: string;
  name: string;
  description: string | null;
  type: string;
  position: number; // Assuming this dictates vertical order
  config: any;
  inputSchema: any;
  outputSchema: any;
  connections: any; // Define more strictly if possible
  workflowId: string;
  createdAt: string;
  updatedAt: string;
}

// Define an interface for the entire workflow API response
interface WorkflowAPI {
  id: string;
  name: string;
  nodes: WorkflowNodeAPI[];
  // Add other workflow properties if needed
}

// Get node color based on type
const getNodeColor = (type: string) => {
  switch (type?.toLowerCase()) {
    case 'api':
      return '#6a9df7'; // Blue for API nodes
    case 'processor':
      return '#ffb26a'; // Orange for processors
    case 'data':
      return '#88cc88'; // Green for data
    default:
      return '#b3b3b3'; // Grey for default
  }
};

// Get icon based on node type
const getNodeIcon = (type: string) => {
  switch (type?.toLowerCase()) {
    case 'api':
      return <ApiOutlined style={{ fontSize: '36px', color: 'white' }} />;
    case 'processor':
      return <SettingOutlined style={{ fontSize: '36px', color: 'white' }} />;
    case 'data':
      return <DatabaseOutlined style={{ fontSize: '36px', color: 'white' }} />;
    default:
      return <AppstoreOutlined style={{ fontSize: '36px', color: 'white' }} />;
  }
};

// Custom square node with icon and label underneath
const SquareNode = ({ data }: NodeProps<WorkflowNodeAPI>) => {
  const nodeColor = getNodeColor(data.type);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      width: '140px',
    }}>
      {/* Square icon container */}
      <div style={{
        width: '100px',
        height: '100px',
        borderRadius: '8px',
        background: nodeColor,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
      }}>
        {getNodeIcon(data.type)}
      </div>

      {/* Node name below the square */}
      <div style={{
        marginTop: '10px',
        fontSize: '14px',
        fontWeight: '500',
        color: '#333',
        textAlign: 'center',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {data.label}
      </div>

      {/* Connection handles */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: nodeColor,
          width: '10px',
          height: '10px',
          left: '-5px',
          top: '50px',
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: nodeColor,
          width: '10px',
          height: '10px',
          right: '-5px',
          top: '50px',
        }}
      />
    </div>
  );
};

// Define node types
const nodeTypes = {
  squareNode: SquareNode,
};

// Add this new function for node layout calculation
const calculateNodeLayout = (nodes: WorkflowNodeAPI[]) => {
  const NODE_WIDTH = 140; // Width of our square node
  const NODE_HEIGHT = 140; // Height including the label
  const HORIZONTAL_SPACING = 200; // Space between nodes horizontally
  const VERTICAL_SPACING = 200; // Space between nodes vertically
  const MAX_NODES_PER_ROW = 4; // Maximum number of nodes in a row

  return nodes.map((node, index) => {
    const row = Math.floor(index / MAX_NODES_PER_ROW);
    const col = index % MAX_NODES_PER_ROW;

    return {
      id: node.id,
      position: {
        x: col * (NODE_WIDTH + HORIZONTAL_SPACING),
        y: row * (NODE_HEIGHT + VERTICAL_SPACING)
      },
      data: { label: node.name, ...node },
      type: 'squareNode',
      draggable: true,
    };
  });
};

export const WorkflowEditor = () => {
  const { id } = useParams<{ id: string }>();
  const { resource } = useResource();
  const isEdit = !!id;

  // Reference to hold the ReactFlow instance
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

  // State for nodes and edges, initialized empty
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNodeAPI[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Add these state variables to the WorkflowEditor component
  const [zoomLevel, setZoomLevel] = useState(1.0); // Default zoom level

  // Add a state to track whether initial positioning is done
  const [initialPositioningDone, setInitialPositioningDone] = useState(false);

  // Handler for manual zoom changes via Controls
  const onZoomChange = (zoom: number) => {
    setZoomLevel(zoom);
  };

  // --- Data Fetching ---
  const { queryResult } = useShow<WorkflowAPI>({ id, resource: "workflows" });
  const { data: workflowData, isLoading, isError } = queryResult;

  // --- Data Transformation Effect ---
  useEffect(() => {
    if (workflowData?.data) {
      const fetchedNodes = workflowData.data.nodes || [];
      // Sort nodes by position to ensure correct layout
      const sortedNodes = [...fetchedNodes].sort(
        (a, b) => a.position - b.position
      );

      // Transform API nodes to React Flow nodes using the new layout
      const reactFlowNodes: Node<WorkflowNodeAPI>[] = calculateNodeLayout(sortedNodes);

      // Create edges based on sequential position
      const reactFlowEdges: Edge[] = [];
      for (let i = 0; i < sortedNodes.length - 1; i++) {
        reactFlowEdges.push({
          id: `e${sortedNodes[i].id}-${sortedNodes[i + 1].id}`,
          source: sortedNodes[i].id,
          target: sortedNodes[i + 1].id,
          type: 'smoothstep', // Changed to smoothstep for better curved edges
          animated: true,
          style: {
            stroke: '#666',
            strokeWidth: 1.5
          },
        });
      }

      setNodes(reactFlowNodes);
      setEdges(reactFlowEdges);
    } else if (!isEdit) {
      // Handle 'create' mode - center the initial node
      setNodes([
        {
          id: "start",
          position: { x: window.innerWidth / 2 - 70, y: window.innerHeight / 2 - 70 }, // Center the node
          data: {
            label: "Start Here",
            type: "api"
          },
          type: 'squareNode',
          draggable: true,
        },
      ]);
      setEdges([]);
    }
  }, [workflowData, isEdit, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge({
      ...params,
      type: 'straight',
      animated: true,
      style: {
        stroke: '#666',
        strokeWidth: 1.5
      },
    }, eds)),
    [setEdges]
  );

  // Reset the initialization flag when data changes
  useEffect(() => {
    if (workflowData) {
      setInitialPositioningDone(false);
    }
  }, [workflowData]);

  if (isLoading) {
    return <Spin tip="Loading workflow..." />;
  }

  if (isError) {
    return (
      <Typography.Text type="danger">Error loading workflow</Typography.Text>
    );
  }

  return (
    <Card
      title={
        isEdit
          ? `Edit Workflow ${workflowData?.data?.name || id}`
          : "Create Workflow"
      }
      bodyStyle={{ padding: 0 }}
      style={{ height: '100vh', width: '100%' }}
    >
      <div style={{ width: "100%", height: "calc(100vh - 57px)" }}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView={true} // Changed to true to fit all nodes in view
            onInit={(instance) => {
              reactFlowInstance.current = instance;
              // Add a small delay to ensure proper fitting
              setTimeout(() => {
                instance.fitView({ padding: 0.2 });
              }, 100);
            }}
            defaultViewport={{ x: 0, y: 0, zoom: 1.0 }}
            minZoom={0.1} // Reduced minimum zoom to allow seeing more nodes
            maxZoom={2}
            panOnScroll={true}
            panOnScrollMode={PanOnScrollMode.Free}
            panOnDrag={true}
            zoomOnScroll={true}
            zoomOnPinch={true}
            zoomOnDoubleClick={true}
            preventScrolling={true}
            connectionLineType={ConnectionLineType.SmoothStep} // Changed to smoothstep
            connectionLineStyle={{ stroke: '#666', strokeWidth: 1.5 }}
            selectionMode={SelectionMode.Partial}
            selectNodesOnDrag={false}
          >
            <Controls
              showZoom={true}          // Only show zoom buttons in controls
              showFitView={false}      // Hide fit view button
              showInteractive={false}  // Hide interactive button
              onZoomIn={() => reactFlowInstance.current?.zoomIn()}
              onZoomOut={() => reactFlowInstance.current?.zoomOut()}
            />
            <MiniMap
              nodeColor={(node) => {
                return getNodeColor(node.data?.type);
              }}
            />
            <Background variant="dots" gap={12} size={1} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </Card>
  );
};

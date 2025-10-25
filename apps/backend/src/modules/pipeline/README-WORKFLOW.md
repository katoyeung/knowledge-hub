# Enhanced Workflow System

## 🎯 **Overview**

The enhanced workflow system provides a powerful, node-based data processing platform that supports:

1. **Multiple Workflow Management** - Create, manage, and execute multiple independent workflows
2. **Node-based Execution** - Visual workflow with parallel/consecutive node execution
3. **Data Snapshot & Preview** - Real-time data preview at each node
4. **Input/Output Source & Format Definition** - Flexible data source and format handling

## 🏗️ **Architecture**

### **Core Components**

- **Workflow Entity** - Stores workflow definitions with nodes and connections
- **WorkflowExecution Entity** - Tracks execution history and node snapshots
- **WorkflowExecutor** - Executes workflows with node-based processing
- **WorkflowOrchestrator** - Manages workflow execution lifecycle
- **WorkflowService** - CRUD operations for workflows
- **PipelineStepRegistry** - Manages available processing steps

### **Key Features**

1. **Visual Node Editor** - Drag-and-drop workflow builder
2. **Real-time Monitoring** - Live execution status and data preview
3. **Flexible Data Sources** - Support for datasets, documents, files, APIs
4. **Multiple Execution Modes** - Sequential, parallel, and hybrid execution
5. **Data Snapshots** - Capture and preview data at each processing step
6. **Error Handling** - Comprehensive error handling and retry mechanisms

## 🚀 **Quick Start**

### **1. Create a Workflow**

```typescript
const workflowConfig = {
  name: 'Document Processing Workflow',
  description:
    'Process documents with deduplication, filtering, and AI enhancement',
  nodes: [
    {
      id: 'input-1',
      type: 'data_source',
      name: 'Load Documents',
      position: { x: 100, y: 100 },
      config: {
        sourceType: 'dataset',
        datasetId: 'dataset-123',
      },
      inputSources: [
        {
          id: 'ds-1',
          name: 'Dataset Input',
          type: 'dataset',
          sourceId: 'dataset-123',
          format: 'structured',
        },
      ],
      outputFormats: [
        {
          id: 'out-1',
          name: 'Document Segments',
          type: 'segment',
          format: 'structured',
        },
      ],
      executionMode: 'consecutive',
      dependencies: [],
      enabled: true,
    },
    {
      id: 'dedup-1',
      type: 'duplicate_segment',
      name: 'Remove Duplicates',
      position: { x: 300, y: 100 },
      config: {
        method: 'content_hash',
        action: 'remove',
      },
      inputSources: [
        {
          id: 'in-1',
          name: 'Segments Input',
          type: 'previous_node',
          nodeId: 'input-1',
          format: 'structured',
        },
      ],
      outputFormats: [
        {
          id: 'out-2',
          name: 'Deduplicated Segments',
          type: 'segment',
          format: 'structured',
        },
      ],
      executionMode: 'consecutive',
      dependencies: ['input-1'],
      enabled: true,
    },
    {
      id: 'filter-1',
      type: 'rule_based_filter',
      name: 'Filter Content',
      position: { x: 500, y: 100 },
      config: {
        rules: [
          {
            id: 'ad-filter',
            name: 'Advertisement Filter',
            pattern: '\\[AD\\]',
            action: 'remove',
          },
        ],
        defaultAction: 'keep',
      },
      inputSources: [
        {
          id: 'in-2',
          name: 'Segments Input',
          type: 'previous_node',
          nodeId: 'dedup-1',
          format: 'structured',
        },
      ],
      outputFormats: [
        {
          id: 'out-3',
          name: 'Filtered Segments',
          type: 'segment',
          format: 'structured',
        },
      ],
      executionMode: 'consecutive',
      dependencies: ['dedup-1'],
      enabled: true,
    },
    {
      id: 'ai-1',
      type: 'ai_summarization',
      name: 'AI Summarization',
      position: { x: 700, y: 100 },
      config: {
        aiProviderId: 'openai-provider',
        model: 'gpt-3.5-turbo',
        minLength: 500,
        maxLength: 200,
      },
      inputSources: [
        {
          id: 'in-3',
          name: 'Segments Input',
          type: 'previous_node',
          nodeId: 'filter-1',
          format: 'structured',
        },
      ],
      outputFormats: [
        {
          id: 'out-4',
          name: 'Summarized Segments',
          type: 'segment',
          format: 'structured',
        },
      ],
      executionMode: 'parallel',
      dependencies: ['filter-1'],
      enabled: true,
    },
    {
      id: 'embed-1',
      type: 'embedding_generation',
      name: 'Generate Embeddings',
      position: { x: 900, y: 100 },
      config: {
        embeddingModel: 'bge-m3',
        provider: 'local',
      },
      inputSources: [
        {
          id: 'in-4',
          name: 'Segments Input',
          type: 'previous_node',
          nodeId: 'ai-1',
          format: 'structured',
        },
      ],
      outputFormats: [
        {
          id: 'out-5',
          name: 'Embedded Segments',
          type: 'segment',
          format: 'structured',
        },
      ],
      executionMode: 'consecutive',
      dependencies: ['ai-1'],
      enabled: true,
    },
  ],
  connections: [
    {
      id: 'conn-1',
      sourceNodeId: 'input-1',
      targetNodeId: 'dedup-1',
      sourceOutputId: 'out-1',
      targetInputId: 'in-1',
    },
    {
      id: 'conn-2',
      sourceNodeId: 'dedup-1',
      targetNodeId: 'filter-1',
      sourceOutputId: 'out-2',
      targetInputId: 'in-2',
    },
    {
      id: 'conn-3',
      sourceNodeId: 'filter-1',
      targetNodeId: 'ai-1',
      sourceOutputId: 'out-3',
      targetInputId: 'in-3',
    },
    {
      id: 'conn-4',
      sourceNodeId: 'ai-1',
      targetNodeId: 'embed-1',
      sourceOutputId: 'out-4',
      targetInputId: 'in-4',
    },
  ],
  settings: {
    name: 'Document Processing Workflow',
    description:
      'Process documents with deduplication, filtering, and AI enhancement',
    executionMode: 'hybrid',
    maxConcurrency: 5,
    errorHandling: 'retry',
    maxRetries: 3,
    timeout: 3600,
    dataRetention: 30,
    enableSnapshots: true,
    snapshotInterval: 10,
    enablePreview: true,
    notificationSettings: {
      onStart: true,
      onComplete: true,
      onError: true,
      onProgress: true,
    },
  },
};
```

### **2. Execute a Workflow**

```bash
# Asynchronous execution
curl -X POST http://localhost:3000/workflow/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "workflowId": "workflow-123",
    "documentId": "document-456",
    "options": {
      "maxConcurrency": 5,
      "enableSnapshots": true,
      "snapshotInterval": 10
    }
  }'

# Synchronous execution
curl -X POST http://localhost:3000/workflow/execute/sync \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "workflowId": "workflow-123",
    "documentId": "document-456"
  }'
```

### **3. Monitor Execution**

```bash
# Get execution status
curl -X GET http://localhost:3000/workflow/executions/execution-123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get node snapshots for preview
curl -X GET http://localhost:3000/workflow/executions/execution-123/snapshots \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get specific node snapshot
curl -X GET http://localhost:3000/workflow/executions/execution-123/snapshots/node-1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 📊 **Data Snapshot & Preview**

### **Node Execution Snapshot**

Each node execution creates a snapshot containing:

```typescript
interface NodeExecutionSnapshot {
  nodeId: string;
  nodeName: string;
  timestamp: Date;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  inputData: {
    count: number;
    sample: any[]; // First 5 items for preview
    schema: Record<string, any>;
  };
  outputData: {
    count: number;
    sample: any[]; // First 5 items for preview
    schema: Record<string, any>;
  };
  metrics: {
    processingTime: number;
    memoryUsage: number;
    cpuUsage: number;
    dataSize: number;
  };
  error?: string;
  progress: number; // 0-100
}
```

### **Real-time Preview**

```typescript
// WebSocket connection for real-time updates
const socket = io('ws://localhost:3000');

socket.on('workflow_execution_update', (data) => {
  console.log('Execution Status:', data.status);
  console.log('Current Node:', data.currentNode);
  console.log('Progress:', data.progress);

  // Preview data at current node
  if (data.nodeSnapshot) {
    console.log('Input Data Sample:', data.nodeSnapshot.inputData.sample);
    console.log('Output Data Sample:', data.nodeSnapshot.outputData.sample);
  }
});
```

## 🔧 **Input/Output Sources & Formats**

### **Supported Input Sources**

1. **Dataset** - Load data from existing datasets
2. **Document** - Process specific documents
3. **Segment** - Work with document segments
4. **File** - Read from file system
5. **API** - Fetch data from external APIs
6. **Previous Node** - Use output from previous workflow nodes

### **Supported Output Formats**

1. **JSON** - Structured JSON data
2. **CSV** - Comma-separated values
3. **Text** - Plain text format
4. **Binary** - Binary data
5. **Structured** - Custom structured format

### **Data Mapping & Transformation**

```typescript
// Input source with data mapping
{
  id: "input-1",
  name: "API Data",
  type: "api",
  sourceId: "https://api.example.com/data",
  format: "json",
  mapping: {
    "title": "name",
    "content": "description",
    "created_at": "timestamp"
  },
  filters: {
    "status": "active",
    "category": "news"
  }
}

// Output format with schema
{
  id: "output-1",
  name: "Processed Data",
  type: "dataset",
  format: "structured",
  destination: "processed_dataset_123",
  schema: {
    "id": "string",
    "title": "string",
    "summary": "string",
    "embedding": "vector",
    "created_at": "datetime"
  }
}
```

## 🎛️ **Execution Modes**

### **1. Sequential Execution**

- Nodes execute one after another
- Each node waits for previous node to complete
- Simple and predictable execution order

### **2. Parallel Execution**

- All nodes execute simultaneously (where dependencies allow)
- Maximum concurrency for performance
- Requires careful dependency management

### **3. Hybrid Execution**

- Mix of sequential and parallel execution
- Each node can specify its execution mode
- Flexible and efficient processing

## 📈 **Monitoring & Analytics**

### **Execution Metrics**

```typescript
interface WorkflowExecutionMetrics {
  totalNodes: number;
  completedNodes: number;
  failedNodes: number;
  skippedNodes: number;
  totalDuration: number;
  averageNodeDuration: number;
  totalDataProcessed: number;
  peakMemoryUsage: number;
  averageCpuUsage: number;
  dataThroughput: number; // items per second
}
```

### **Real-time Dashboard**

```typescript
// Get workflow statistics
const stats = await workflowService.getWorkflowStats(workflowId, userId);
console.log('Total Executions:', stats.totalExecutions);
console.log(
  'Success Rate:',
  stats.successfulExecutions / stats.totalExecutions,
);
console.log('Average Duration:', stats.averageDuration);
```

## 🔄 **Error Handling & Recovery**

### **Error Handling Strategies**

1. **Stop** - Stop execution on first error
2. **Continue** - Skip failed nodes and continue
3. **Retry** - Retry failed nodes with exponential backoff

### **Rollback Support**

```typescript
// Each node can implement rollback
async rollback(rollbackData: any, context: StepExecutionContext): Promise<{ success: boolean; error?: string }> {
  try {
    // Restore previous state
    // Clean up created resources
    // Revert data changes
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

## 🎨 **Visual Workflow Builder**

### **Node Types**

1. **Data Source Nodes** - Load data from various sources
2. **Processing Nodes** - Transform and process data
3. **AI/ML Nodes** - Apply AI/ML operations
4. **Output Nodes** - Save results to destinations
5. **Control Nodes** - Conditional logic and branching

### **Connection Types**

1. **Data Flow** - Pass data between nodes
2. **Control Flow** - Control execution order
3. **Error Flow** - Handle error conditions
4. **Conditional Flow** - Branch based on conditions

## 🚀 **Advanced Features**

### **1. Workflow Templates**

```typescript
// Create reusable workflow templates
const template = await workflowService.createWorkflow(
  {
    name: 'Document Processing Template',
    isTemplate: true,
    // ... workflow configuration
  },
  userId,
);

// Use template to create new workflow
const newWorkflow = await workflowService.createWorkflowFromTemplate(
  template.id,
  'My Document Workflow',
  userId,
);
```

### **2. Scheduled Execution**

```typescript
// Schedule workflow execution
await workflowOrchestrator.scheduleWorkflow({
  workflowId: 'workflow-123',
  schedule: '0 0 * * *', // Daily at midnight
  timezone: 'UTC',
});
```

### **3. Webhook Triggers**

```typescript
// Trigger workflow via webhook
app.post('/webhook/workflow/:workflowId', async (req, res) => {
  const { workflowId } = req.params;
  const triggerData = req.body;

  await workflowOrchestrator.executeWorkflowAsync({
    workflowId,
    triggerSource: 'webhook',
    triggerData,
  });

  res.json({ success: true });
});
```

## 📚 **API Reference**

### **Workflow Management**

- `POST /workflow` - Create workflow
- `GET /workflow` - List workflows
- `GET /workflow/:id` - Get workflow
- `PUT /workflow/:id` - Update workflow
- `DELETE /workflow/:id` - Delete workflow

### **Workflow Execution**

- `POST /workflow/execute` - Execute workflow (async)
- `POST /workflow/execute/sync` - Execute workflow (sync)
- `GET /workflow/executions/:id` - Get execution status
- `POST /workflow/executions/:id/cancel` - Cancel execution

### **Data Preview**

- `GET /workflow/executions/:id/snapshots` - Get all node snapshots
- `GET /workflow/executions/:id/snapshots/:nodeId` - Get specific node snapshot

### **Step Management**

- `GET /workflow/steps` - Get available step types
- `GET /workflow/steps/:type` - Get step configuration schema
- `POST /workflow/steps/:type/validate` - Validate step configuration

This enhanced workflow system provides a comprehensive solution for complex data processing workflows with visual editing, real-time monitoring, and flexible execution modes.

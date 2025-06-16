# Dataset Module Integration Guide

## 🏗️ **Architecture Overview**

The dataset module is now available across all applications with full type safety:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │      CMS        │    │    Backend      │
│   (Next.js)     │    │   (Refine)      │    │   (NestJS)      │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ • tRPC Client   │    │ • tRPC Client   │    │ • REST API      │
│ • Type Safety   │    │ • REST Client   │    │ • CRUD Services │
│ • Auto-complete │    │ • Type Safety   │    │ • TypeORM       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │ Shared Types    │
                    │ Package         │
                    ├─────────────────┤
                    │ • tRPC Routers  │
                    │ • Zod Schemas   │
                    │ • Type Exports  │
                    └─────────────────┘
```

## 🔄 **Integration Options**

### **Option 1: tRPC (Recommended for Frontend)**

- ✅ **Full Type Safety**: Compile-time type checking
- ✅ **Auto-completion**: IntelliSense for all API calls
- ✅ **Runtime Validation**: Automatic input/output validation
- ✅ **Error Handling**: Type-safe error responses

### **Option 2: Direct REST API (Current CMS approach)**

- ✅ **Simple Integration**: Direct HTTP calls
- ✅ **Flexible**: Works with any HTTP client
- ✅ **Refine Compatible**: Works with existing data providers
- ⚠️ **Manual Type Safety**: Requires manual type assertions

## 📋 **Available API Endpoints**

### **REST Endpoints (Backend)**

```typescript
// Datasets
GET    /datasets              // List all datasets
GET    /datasets/:id          // Get dataset by ID
POST   /datasets              // Create new dataset
PUT    /datasets/:id          // Update dataset
DELETE /datasets/:id          // Delete dataset

// Documents
GET    /documents             // List all documents
GET    /documents/:id         // Get document by ID
POST   /documents             // Create new document
PUT    /documents/:id         // Update document
DELETE /documents/:id         // Delete document
```

### **tRPC Procedures (Type-safe)**

```typescript
// Datasets
trpc.dataset.getAll.useQuery();
trpc.dataset.getById.useQuery({ id: "uuid" });
trpc.dataset.create.useMutation();
trpc.dataset.update.useMutation();
trpc.dataset.delete.useMutation();
trpc.dataset.getByUser.useQuery({ userId: "uuid" });
trpc.dataset.getWithDetails.useQuery({ id: "uuid" });

// Documents
trpc.document.getAll.useQuery();
trpc.document.getById.useQuery({ id: "uuid" });
trpc.document.create.useMutation();
trpc.document.update.useMutation();
trpc.document.delete.useMutation();
trpc.document.getByDataset.useQuery({ datasetId: "uuid" });
trpc.document.updateStatus.useMutation();
```

## 🎯 **Frontend Integration (Next.js)**

### **1. Using tRPC (Recommended)**

```typescript
// pages/datasets/index.tsx
import { trpc } from "@/lib/trpc";
import { DatasetSchema } from "@knowledge-hub/shared-types";

export default function DatasetsPage() {
  // Type-safe query with auto-completion
  const { data: datasets, isLoading } = trpc.dataset.getAll.useQuery({
    page: 1,
    limit: 10,
    ownerId: user?.id,
  });

  const createDataset = trpc.dataset.create.useMutation({
    onSuccess: () => {
      // Invalidate and refetch
      trpc.dataset.getAll.invalidate();
    },
  });

  const handleCreate = (data: CreateDatasetInput) => {
    createDataset.mutate({
      name: data.name,
      description: data.description,
      ownerId: user.id,
      permission: "only_me",
    });
  };

  return (
    <div>
      {isLoading ? (
        <div>Loading...</div>
      ) : (
        datasets?.data.map((dataset) => (
          <DatasetCard key={dataset.id} dataset={dataset} />
        ))
      )}
    </div>
  );
}
```

### **2. Type-safe Forms**

```typescript
// components/CreateDatasetForm.tsx
import { DatasetSchema, DataSourceTypeEnum } from "@knowledge-hub/shared-types";
import { z } from "zod";

const CreateDatasetSchema = DatasetSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  owner: true,
});

type CreateDatasetInput = z.infer<typeof CreateDatasetSchema>;

export function CreateDatasetForm() {
  const [formData, setFormData] = useState<CreateDatasetInput>({
    name: "",
    description: "",
    ownerId: user.id,
    permission: "only_me",
    dataSourceType: "file",
  });

  // Form validation happens automatically with Zod
  const createDataset = trpc.dataset.create.useMutation();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        createDataset.mutate(formData);
      }}
    >
      {/* Form fields with type safety */}
    </form>
  );
}
```

## 🎛️ **CMS Integration (Refine)**

### **1. Using REST Data Provider (Current)**

```typescript
// pages/datasets/list.tsx
import { List, useTable } from "@refinedev/antd";
import { DatasetSchema } from "@knowledge-hub/shared-types";

export const DatasetList = () => {
  const { tableProps } = useTable<z.infer<typeof DatasetSchema>>({
    resource: "datasets",
    sorters: {
      initial: [{ field: "createdAt", order: "desc" }],
    },
  });

  return (
    <List>
      <Table {...tableProps} rowKey="id">
        <Table.Column dataIndex="name" title="Name" />
        <Table.Column dataIndex="description" title="Description" />
        <Table.Column dataIndex="permission" title="Permission" />
        <Table.Column dataIndex="createdAt" title="Created" />
      </Table>
    </List>
  );
};
```

### **2. Using tRPC Data Provider (Advanced)**

```typescript
// utils/trpcDataProvider.ts
import { DataProvider } from "@refinedev/core";
import { trpcClient } from "./trpc";

export const trpcDataProvider: DataProvider = {
  getList: async ({ resource, pagination, filters, sorters }) => {
    if (resource === "datasets") {
      const result = await trpcClient.dataset.getAll.query({
        page: pagination?.current || 1,
        limit: pagination?.pageSize || 10,
        // Add filters and sorting
      });

      return {
        data: result.data,
        total: result.total,
      };
    }
    // Handle other resources...
  },

  create: async ({ resource, variables }) => {
    if (resource === "datasets") {
      const result = await trpcClient.dataset.create.mutate(variables);
      return { data: result.data };
    }
  },

  // Implement other methods...
};
```

## 🔧 **Backend Implementation Status**

### **✅ Completed**

- Dataset, Document, DocumentSegment entities
- CRUD services with TypeOrmCrudService
- REST API controllers with validation
- Permission-based access control
- Caching support

### **🚧 Next Steps (Optional)**

- Implement actual tRPC server endpoints
- Add file upload handling
- Implement vector embedding processing
- Add search and filtering capabilities

## 🎯 **Usage Patterns**

### **Frontend: Dataset Management**

```typescript
// Fetch user's datasets
const { data: datasets } = trpc.dataset.getByUser.useQuery({
  userId: user.id,
});

// Create new dataset
const createMutation = trpc.dataset.create.useMutation({
  onSuccess: (newDataset) => {
    router.push(`/datasets/${newDataset.data.id}`);
  },
});

// Upload documents to dataset
const uploadDocument = trpc.document.create.useMutation();
```

### **CMS: Content Management**

```typescript
// List all datasets with pagination
const { data, isLoading } = useList({
  resource: "datasets",
  pagination: { current: 1, pageSize: 20 },
});

// Edit dataset
const { mutate } = useUpdate();
mutate({
  resource: "datasets",
  id: datasetId,
  values: updatedData,
});
```

## 🔒 **Security & Permissions**

Both approaches respect the backend's permission system:

- JWT authentication required
- RBAC with `DATASET` resource permissions
- Owner-based access control
- Field-level security with class-transformer

## 📊 **Performance Considerations**

### **tRPC Benefits**

- Automatic request batching
- Built-in caching with React Query
- Optimistic updates
- Background refetching

### **REST Benefits**

- HTTP caching
- CDN compatibility
- Simpler debugging
- Standard tooling

## 🚀 **Getting Started**

1. **Frontend**: Use tRPC for new features
2. **CMS**: Continue with REST, optionally migrate to tRPC
3. **Backend**: REST endpoints are ready, tRPC can be added later
4. **Types**: All shared via `@knowledge-hub/shared-types`

The architecture provides flexibility to use either approach while maintaining type safety across the entire stack!

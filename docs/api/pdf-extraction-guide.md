# PDF Content Extraction API

This document provides comprehensive usage examples for the PDF content extraction APIs in the Knowledge Hub platform.

## 📋 Available Endpoints

### 1. **Simple PDF Content Extraction** - `POST /document-parser/extract-pdf-content`

Upload a PDF file and get back raw text content with basic metadata.

### 2. **Buffer-Based PDF Extraction** - `POST /document-parser/extract-pdf-content-buffer`

Extract text content directly from uploaded file buffer (more memory efficient for smaller files).

### 3. **RAGFlow Advanced PDF Parsing** - `POST /document-parser/parse-pdf`

Advanced document understanding with segmentation, table extraction, and confidence scoring.

### 4. **Health Check** - `POST /document-parser/admin/test`

Service health check and endpoint listing.

---

## 🚀 Usage Examples

### **Simple PDF Content Extraction**

**Endpoint:** `POST /document-parser/extract-pdf-content`

**Description:** Upload a PDF file and extract its text content with basic metadata.

**Features:**

- ✅ Basic text extraction
- ✅ Word and character counting
- ✅ PDF metadata extraction (title, author, etc.)
- ✅ File size up to 50MB
- ✅ Automatic temp file cleanup

**cURL Example:**

```bash
curl -X POST \
  http://localhost:3000/document-parser/extract-pdf-content \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/path/to/your/document.pdf"
```

**Response Example:**

```json
{
  "success": true,
  "content": "This is the extracted text content from your PDF document...",
  "metadata": {
    "totalPages": 5,
    "totalWords": 1247,
    "totalCharacters": 6835,
    "processingTime": 245,
    "fileSize": 524288,
    "title": "Sample Document",
    "author": "John Doe",
    "creator": "Adobe PDF Library",
    "creationDate": "2024-01-15T10:30:00.000Z",
    "modificationDate": "2024-01-16T14:22:00.000Z"
  },
  "meta": {
    "processingTime": 250,
    "timestamp": "2024-01-20T15:45:30.123Z",
    "originalFilename": "document.pdf"
  }
}
```

---

### **Buffer-Based PDF Extraction** (Memory Efficient)

**Endpoint:** `POST /document-parser/extract-pdf-content-buffer`

**Description:** Extract text directly from file buffer without saving to disk.

**Features:**

- ✅ Memory-efficient processing
- ✅ File size limit: 20MB
- ✅ No temporary file creation
- ✅ Same metadata extraction

**cURL Example:**

```bash
curl -X POST \
  http://localhost:3000/document-parser/extract-pdf-content-buffer \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/path/to/your/small-document.pdf"
```

**Response:** Same format as above, but processed from memory buffer.

---

### **Advanced RAGFlow PDF Parsing**

**Endpoint:** `POST /document-parser/parse-pdf`

**Description:** Advanced document understanding with RAGFlow-inspired processing.

**Features:**

- ✅ Intelligent segmentation
- ✅ Table structure recognition
- ✅ Content classification
- ✅ Keyword extraction
- ✅ Confidence scoring
- ✅ Layout analysis

**cURL Example:**

```bash
curl -X POST \
  http://localhost:3000/document-parser/parse-pdf \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/path/to/your/document.pdf" \
  -F 'options={"extractionMethod":"hybrid","enableTableExtraction":true,"segmentationStrategy":"semantic","maxSegmentLength":1000}'
```

**Advanced Response Example:**

```json
{
  "success": true,
  "data": {
    "success": true,
    "content": "Full document text...",
    "segments": [
      {
        "id": "segment_1",
        "content": "Introduction paragraph text...",
        "type": "paragraph",
        "position": 0,
        "pageNumber": 1,
        "confidence": 0.95,
        "keywords": ["introduction", "overview", "document"],
        "wordCount": 45,
        "tokenCount": 34
      }
    ],
    "tables": [
      {
        "id": "table_1",
        "pageNumber": 2,
        "rows": 4,
        "columns": 3,
        "content": [
          ["Header 1", "Header 2", "Header 3"],
          ["Row 1 Col 1", "Row 1 Col 2", "Row 1 Col 3"]
        ],
        "htmlContent": "<table><thead><tr><th>Header 1</th>...</tr></thead>...</table>",
        "confidence": 0.88
      }
    ],
    "metadata": {
      "totalPages": 5,
      "totalWords": 1247,
      "totalTokens": 935,
      "processingTime": 1250,
      "extractionMethod": "hybrid"
    }
  },
  "meta": {
    "processingTime": 1255,
    "timestamp": "2024-01-20T15:45:30.123Z"
  }
}
```

---

## 🔧 Configuration Options

### **RAGFlow Parse Options**

```typescript
interface RagflowParseOptions {
  extractionMethod?: 'deepdoc' | 'naive' | 'hybrid'; // Default: 'hybrid'
  enableTableExtraction?: boolean; // Default: true
  enableImageExtraction?: boolean; // Default: false
  segmentationStrategy?: 'paragraph' | 'sentence' | 'semantic' | 'hybrid'; // Default: 'hybrid'
  maxSegmentLength?: number; // Default: 1000
  minSegmentLength?: number; // Default: 100
  overlapRatio?: number; // Default: 0.1 (10%)
  confidenceThreshold?: number; // Default: 0.7
}
```

**Example with custom options:**

```bash
curl -X POST \
  http://localhost:3000/document-parser/parse-pdf \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@/path/to/document.pdf" \
  -F 'options={
    "extractionMethod": "deepdoc",
    "enableTableExtraction": true,
    "segmentationStrategy": "semantic",
    "maxSegmentLength": 500,
    "minSegmentLength": 50,
    "overlapRatio": 0.15,
    "confidenceThreshold": 0.8
  }'
```

---

## 📊 Response Format Comparison

| Feature                  | Simple Extraction | Buffer Extraction | RAGFlow Advanced |
| ------------------------ | ----------------- | ----------------- | ---------------- |
| Text Content             | ✅ Raw text       | ✅ Raw text       | ✅ Raw text      |
| Basic Metadata           | ✅ Yes            | ✅ Yes            | ✅ Enhanced      |
| Intelligent Segmentation | ❌ No             | ❌ No             | ✅ Yes           |
| Table Recognition        | ❌ No             | ❌ No             | ✅ Yes           |
| Keyword Extraction       | ❌ No             | ❌ No             | ✅ Yes           |
| Confidence Scoring       | ❌ No             | ❌ No             | ✅ Yes           |
| Layout Analysis          | ❌ No             | ❌ No             | ✅ Yes           |
| Processing Speed         | 🚀 Fast           | 🚀 Fast           | ⚡ Moderate      |
| File Size Limit          | 50MB              | 20MB              | 50MB             |

---

## 🛡️ Error Handling

All endpoints return standardized error responses:

**Error Response Format:**

```json
{
  "success": false,
  "message": "PDF content extraction failed",
  "error": "Specific error description",
  "timestamp": "2024-01-20T15:45:30.123Z"
}
```

**Common Error Cases:**

- **400 Bad Request:** No file provided, invalid file type
- **413 Payload Too Large:** File exceeds size limit
- **500 Internal Server Error:** PDF parsing failed, file corruption

---

## 🧪 Testing the APIs

### **Health Check**

```bash
curl -X POST \
  http://localhost:3000/document-parser/admin/test \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### **Quick Test with a Simple PDF**

```bash
# Create a test PDF (if you have one)
curl -X POST \
  http://localhost:3000/document-parser/extract-pdf-content \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@./test-document.pdf"
```

---

## 📝 Best Practices

1. **Choose the Right Endpoint:**

   - Use **Simple Extraction** for basic text extraction needs
   - Use **Buffer Extraction** for smaller files (< 20MB) when memory efficiency matters
   - Use **RAGFlow Advanced** for complex document analysis with tables and structure

2. **File Size Considerations:**

   - Simple/Advanced: Up to 50MB
   - Buffer: Up to 20MB for memory efficiency

3. **Authentication:**

   - All endpoints require JWT authentication
   - Include `Authorization: Bearer YOUR_TOKEN` header

4. **Error Handling:**

   - Always check the `success` field in responses
   - Handle file cleanup errors gracefully
   - Implement retry logic for temporary failures

5. **Performance Optimization:**
   - Use buffer extraction for small files
   - Consider file size vs. processing time trade-offs
   - Monitor processing times in the response metadata

---

## 🔗 Integration Examples

### **JavaScript/TypeScript Frontend**

```typescript
// Simple PDF extraction
const uploadPdf = async (file: File): Promise<SimplePdfParseResult> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/document-parser/extract-pdf-content', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  return response.json();
};
```

### **Python Integration**

```python
import requests

def extract_pdf_content(file_path: str, token: str):
    url = "http://localhost:3000/document-parser/extract-pdf-content"
    headers = {"Authorization": f"Bearer {token}"}

    with open(file_path, 'rb') as file:
        files = {'file': file}
        response = requests.post(url, headers=headers, files=files)

    return response.json()
```

---

Ready to extract PDF content! 🚀 Choose the endpoint that best fits your needs and start processing documents.

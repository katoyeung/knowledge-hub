import { useForm } from "@refinedev/antd";
import { Form, Input, Upload, Button, Card, message, Typography, Checkbox, Select } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import { useState } from "react";
import type { UploadFile } from "antd/es/upload/interface";
import axiosInstance from "../../utils/axiosInstance";

export const DatasetUpload = () => {
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [extractedHeaders, setExtractedHeaders] = useState<string[]>([]);
    const [embeddingEnabled, setEmbeddingEnabled] = useState(false);
    const [selectedEmbeddingFields, setSelectedEmbeddingFields] = useState<string[]>([]);

    const { formProps, saveButtonProps } = useForm({
        action: "create",
        resource: "datasets/upload",
        warnWhenUnsavedChanges: false,
    });

    const parseHeaders = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            if (!text) {
                setExtractedHeaders([]);
                return;
            }

            let headers: string[] = [];
            if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
                const firstLine = text.split(/\r\n|\n/)[0];
                if (firstLine) {
                    headers = firstLine.split(',').map(header => header.trim());
                }
            } else if (file.type === 'application/json' || file.name.endsWith('.json')) {
                try {
                    const jsonData = JSON.parse(text);
                    if (Array.isArray(jsonData) && jsonData.length > 0) {
                        headers = Object.keys(jsonData[0]);
                    } else if (typeof jsonData === 'object' && jsonData !== null) {
                        // Handle case where JSON is a single object, or an object containing arrays/objects
                        // For simplicity, let's assume we are interested in top-level keys for now
                        headers = Object.keys(jsonData);
                    }
                } catch (parseError) {
                    console.error("Failed to parse JSON:", parseError);
                    message.error("Failed to parse JSON file to extract headers.");
                    setExtractedHeaders([]);
                    return;
                }
            }
            setExtractedHeaders(headers);
            setSelectedEmbeddingFields([]); // Reset selected fields when a new file is uploaded
        };
        reader.onerror = () => {
            message.error("Failed to read file for header extraction.");
            setExtractedHeaders([]);
        };
        reader.readAsText(file);
    };

    const handleFileUpload = (file: File) => {
        const uploadFile: UploadFile = {
            uid: file.uid || '-1', // Use file.uid if available, otherwise fallback
            name: file.name,
            status: 'done', // Mark as done to prevent default upload visual cue
            size: file.size,
            type: file.type,
            originFileObj: file as any, // Ant Design expects File, but we store it as originFileObj
        };
        setFileList([uploadFile]);
        parseHeaders(file); // Extract headers
        return false; // Prevent default upload behavior of Ant Design's Upload component
    };

    const handleSubmit = async (values: any) => {
        if (isUploading) return;

        if (fileList.length === 0) {
            message.error("Please select a file first");
            return;
        }

        const file = fileList[0]?.originFileObj;
        if (!file) {
            message.error("No file selected");
            return;
        }

        setIsUploading(true);
        const messageKey = 'upload-status';

        const formData = new FormData();
        formData.append('file', file as Blob); // Ensure it's appended as Blob
        formData.append('task', values.task);
        formData.append('type', values.type);

        if (embeddingEnabled && selectedEmbeddingFields.length > 0) {
            formData.append('embeddingEnabled', 'true');
            formData.append('embeddingFields', JSON.stringify(selectedEmbeddingFields));
        } else {
            formData.append('embeddingEnabled', 'false');
        }

        try {
            message.loading({ content: 'Uploading...', key: messageKey, duration: 0 });

            const response = await axiosInstance.post("/datasets/upload", formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
                timeout: 300000, // 5 minutes
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            });

            // Check if response exists and has a valid status
            if (response && (response.status === 201 || response.status === 200)) {
                const { totalItems, createdItems, skippedItems, errors } = response.data;
                let successMessageContent = `Uploaded. Total: ${totalItems}, Created: ${createdItems}, Skipped: ${skippedItems}.`;
                if (errors && errors.length > 0) {
                    // Assuming errors is an array of strings or objects that can be stringified.
                    // If errors are objects with a specific message property, adjust accordingly e.g., errors.map(e => e.message).join(', ')
                    successMessageContent += ` Errors: ${JSON.stringify(errors)}`;
                }
                message.success({ content: successMessageContent, key: messageKey, duration: 10 });
                setFileList([]);
                formProps.form?.resetFields();
                setExtractedHeaders([]);
                setEmbeddingEnabled(false);
                setSelectedEmbeddingFields([]);
            } else {
                alert("Failed to upload dataset");
                message.error({ content: "Failed to upload dataset", key: messageKey });
            }
        } catch (error: any) {
            console.error('Upload error:', error);

            if (error.response?.status === 413) {
                message.error({ content: "File is too large. Please try a smaller file.", key: messageKey });
            } else if (error.response?.data?.message) {
                message.error({ content: error.response.data.message, key: messageKey });
            } else {
                message.error({ content: "Failed to upload dataset", key: messageKey });
            }
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <Card title="Upload Dataset" style={{ maxWidth: 800, margin: "0 auto" }}>
            <Form
                {...formProps}
                layout="vertical"
                onFinish={handleSubmit}
            >
                <Form.Item
                    label="Task"
                    name="task"
                    rules={[{ required: true, message: "Please select a task" }]}
                >
                    <Input placeholder="e.g., classification, regression, clustering" />
                </Form.Item>

                <Form.Item
                    label="Type"
                    name="type"
                    rules={[{ required: true, message: "Please enter a type" }]}
                >
                    <Input placeholder="e.g., train, validation, test, predict" />
                </Form.Item>

                <Form.Item
                    label="Dataset File"
                    required
                    tooltip="Upload a JSON or CSV file containing your dataset metadata"
                >
                    <Upload
                        beforeUpload={handleFileUpload}
                        fileList={fileList}
                        onRemove={() => {
                            setFileList([]);
                            setExtractedHeaders([]);
                            setEmbeddingEnabled(false);
                            setSelectedEmbeddingFields([]);
                        }}
                        maxCount={1}
                        accept=".json,.csv"
                    >
                        <Button icon={<UploadOutlined />}>Select File</Button>
                    </Upload>
                </Form.Item>

                {fileList.length > 0 && (
                    <Form.Item label="File Info">
                        <Typography.Text>
                            Selected file: {fileList[0].name} ({(fileList[0].size / 1024 / 1024).toFixed(2)} MB)
                        </Typography.Text>
                    </Form.Item>
                )}

                {extractedHeaders.length > 0 && (
                    <Form.Item
                        label="Enable Embedding"
                        name="embeddingEnabled"
                        valuePropName="checked"
                    >
                        <Checkbox
                            checked={embeddingEnabled}
                            onChange={(e) => {
                                setEmbeddingEnabled(e.target.checked);
                                if (!e.target.checked) {
                                    setSelectedEmbeddingFields([]); // Clear selection if embedding is disabled
                                }
                            }}
                        >
                            Enable Embedding for selected fields
                        </Checkbox>
                    </Form.Item>
                )}

                {embeddingEnabled && extractedHeaders.length > 0 && (
                    <Form.Item
                        label="Select Embedding Fields"
                        name="embeddingFields"
                        rules={[{ required: true, message: "Please select fields for embedding" }]}
                    >
                        <Select
                            mode="multiple"
                            allowClear
                            style={{ width: '100%' }}
                            placeholder="Please select fields"
                            value={selectedEmbeddingFields}
                            onChange={setSelectedEmbeddingFields}
                            options={extractedHeaders.map(header => ({ label: header, value: header }))}
                        />
                    </Form.Item>
                )}

                <Form.Item>
                    <Button type="primary" {...saveButtonProps} loading={isUploading}>
                        Upload Dataset
                    </Button>
                </Form.Item>
            </Form>
        </Card>
    );
}; 
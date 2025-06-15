import { Create, useForm } from "@refinedev/antd";
import { Form, Input, Select, Checkbox, message } from "antd";
import { useState } from "react";

export const DatasetCreate = () => {
    const { formProps, saveButtonProps } = useForm({});
    const [extractedHeaders, setExtractedHeaders] = useState<string[]>([]);
    const [embeddingEnabled, setEmbeddingEnabled] = useState(false);
    const [selectedEmbeddingFields, setSelectedEmbeddingFields] = useState<string[]>([]);

    // Custom validator for JSON metadata
    const validateJson = (_: any, value: string) => {
        if (!value) {
            setExtractedHeaders([]);
            setEmbeddingEnabled(false);
            setSelectedEmbeddingFields([]);
            return Promise.reject('Input is required');
        }

        try {
            // First, try to clean up the input by removing any escaped forward slashes
            const cleanedValue = value.replace(/\\\//g, '/');
            const parsed = JSON.parse(cleanedValue);

            // Accept both objects and arrays as valid metadata
            if (parsed === null) {
                setExtractedHeaders([]);
                setEmbeddingEnabled(false);
                setSelectedEmbeddingFields([]);
                return Promise.reject('Input cannot be null');
            }

            let headers: string[] = [];
            if (Array.isArray(parsed) && parsed.length > 0) {
                // If it's an array of objects, take headers from the first object
                if (typeof parsed[0] === 'object' && parsed[0] !== null) {
                    headers = Object.keys(parsed[0]);
                } else {
                    // If it's an array of non-objects, or empty objects, we can't extract headers in a meaningful way for embedding fields.
                    // Or, we could decide to offer embedding for the entire array items if they are simple types,
                    // but for now, let's focus on object keys.
                    setExtractedHeaders([]);
                    setEmbeddingEnabled(false);
                    setSelectedEmbeddingFields([]);
                    // Potentially return a specific message or allow if JSON is valid but no headers for embedding
                    // For now, let's ensure it resolves if JSON is valid but headers might not be suitable for selection.
                    return Promise.resolve();
                }
            } else if (typeof parsed === 'object' && parsed !== null) {
                headers = Object.keys(parsed);
            } else {
                // Not an array of objects or a single object, clear headers.
                setExtractedHeaders([]);
                setEmbeddingEnabled(false);
                setSelectedEmbeddingFields([]);
                // Resolve if JSON is technically valid (e.g. a simple string or number, though less useful for "metadata" or "data")
                return Promise.resolve();
            }

            setExtractedHeaders(headers);
            // Reset embedding selection if headers change
            setSelectedEmbeddingFields([]);
            // Do not automatically enable embedding, let the user choose.
            // setEmbeddingEnabled(headers.length > 0);


            return Promise.resolve();
        } catch (error) {
            setExtractedHeaders([]);
            setEmbeddingEnabled(false);
            setSelectedEmbeddingFields([]);
            return Promise.reject('Invalid JSON format. Please check your syntax');
        }
    };

    // Handle form submission to clean up the metadata
    const onFinish = (values: any) => {
        let parsedMetadata: any;
        if (values.jsonData) { // Changed from values.metadata to values.jsonData
            try {
                // Clean up the metadata and parse it into an object
                const cleanedValue = values.jsonData.replace(/\\\//g, '/');
                parsedMetadata = JSON.parse(cleanedValue);
            } catch (error) {
                console.error('Error parsing JSON data:', error);
                message.error('Error parsing JSON data. Please check your syntax.');
                return; // Don't submit if parsing fails
            }
        }

        const finalValues: any = {
            ...values,
            jsonData: parsedMetadata, // Ensure parsed JSON is part of submission
        };

        if (embeddingEnabled && selectedEmbeddingFields.length > 0) {
            finalValues.embeddingEnabled = true;
            finalValues.embeddingFields = selectedEmbeddingFields;
        } else {
            finalValues.embeddingEnabled = false;
            finalValues.embeddingFields = [];
        }
        // Remove jsonData from values if you only want to send metadata (parsed one)
        // and embedding details separately, or adjust your backend to expect 'jsonData'.
        // For now, sending both original string (if not parsed) and potentially parsed one.
        // Let's assume formProps.onFinish expects the structured data
        // and we rename metadata to jsonData in the form to avoid confusion
        delete finalValues.jsonData; // Remove the string version
        finalValues.metadata = parsedMetadata; // Send the parsed version as 'metadata'


        formProps.onFinish?.(finalValues);
    };

    return (
        <Create saveButtonProps={saveButtonProps}>
            <Form {...formProps} layout="vertical" onFinish={onFinish}>
                <Form.Item
                    label="Task"
                    name={["task"]}
                    rules={[{ required: true }]}
                >
                    <Input placeholder="e.g., classification, regression, clustering" />
                </Form.Item>
                <Form.Item
                    label="Type"
                    name={["type"]}
                    rules={[{ required: true, message: "Please enter a type" }]}
                >
                    <Input placeholder="e.g., train, validation, test, predict" />
                </Form.Item>
                <Form.Item
                    label="JSON Data"
                    name={["jsonData"]} // Changed from "metadata" to "jsonData"
                    rules={[
                        { required: true, message: "JSON data is required." },
                        { validator: validateJson }
                    ]}
                    help="Paste your JSON data here. Forward slashes will be automatically handled. Object keys will be extracted for embedding options."
                >
                    <Input.TextArea
                        rows={12}
                        placeholder={`Enter JSON data (e.g., {
  "feature1": "value1",
  "text_content": "Some text to embed",
  "numeric_value": 123
})`}
                        onChange={(e) => {
                            // Trigger validation (and thus header extraction) on change
                            formProps.form?.validateFields(['jsonData']);
                            // If text area is cleared, reset embedding states
                            if (!e.target.value) {
                                setExtractedHeaders([]);
                                setEmbeddingEnabled(false);
                                setSelectedEmbeddingFields([]);
                            }
                        }}
                    />
                </Form.Item>

                {extractedHeaders.length > 0 && (
                    <Form.Item
                        label="Enable Embedding"
                        name="embeddingEnabledCheckbox" // Use a different name for the checkbox itself if 'embeddingEnabled' is part of form values
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
                        name="embeddingFields" // This will be part of the form submission if embedding is enabled
                        rules={[{
                            validator: async (_, value) => {
                                if (embeddingEnabled && (!value || value.length === 0)) {
                                    return Promise.reject(new Error('Please select fields for embedding'));
                                }
                                return Promise.resolve();
                            }
                        }]}
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
            </Form>
        </Create>
    );
}; 
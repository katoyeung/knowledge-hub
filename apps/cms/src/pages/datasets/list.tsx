import {
    DeleteButton,
    List,
    SaveButton,
    useDrawerForm,
    useTable,
    CreateButton,
    FilterDropdown,
} from "@refinedev/antd";
import { type BaseRecord, useOne } from "@refinedev/core";
import { Space, Table, Drawer, Form, Input, Typography, Tooltip, Button, Checkbox, Select, message } from "antd";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UploadOutlined, SearchOutlined } from "@ant-design/icons";

export const DatasetList = () => {
    const navigate = useNavigate();

    const { tableProps } = useTable({
        syncWithLocation: true,
    });

    const [recordId, setRecordId] = React.useState<string | number>();
    const [extractedHeaders, setExtractedHeaders] = useState<string[]>([]);
    const [embeddingEnabled, setEmbeddingEnabled] = useState(false);
    const [selectedEmbeddingFields, setSelectedEmbeddingFields] = useState<string[]>([]);

    const {
        drawerProps,
        formProps: baseFormProps,
        show,
        saveButtonProps: baseSaveButtonProps,
        formLoading,
        id: currentRecordId, // id of the currently open record in the drawer
    } = useDrawerForm({
        action: "edit",
        resource: "datasets",
        id: recordId,
        onMutationSuccess: () => {
            setExtractedHeaders([]);
            setEmbeddingEnabled(false);
            setSelectedEmbeddingFields([]);
        }
    });

    const { data: recordData } = useOne<BaseRecord & { metadata?: any, embeddingEnabled?: boolean, embeddingFields?: string[] }>({
        resource: "datasets",
        id: currentRecordId,
        queryOptions: {
            enabled: !!currentRecordId,
        },
    });

    useEffect(() => {
        if (recordData?.data && baseFormProps.form) {
            const currentMetadata = recordData.data.metadata;
            let headers: string[] = [];
            if (currentMetadata) {
                try {
                    const metadataObj = typeof currentMetadata === 'string' ? JSON.parse(currentMetadata) : currentMetadata;
                    if (Array.isArray(metadataObj) && metadataObj.length > 0 && typeof metadataObj[0] === 'object' && metadataObj[0] !== null) {
                        headers = Object.keys(metadataObj[0]);
                    } else if (typeof metadataObj === 'object' && metadataObj !== null && !Array.isArray(metadataObj)) {
                        headers = Object.keys(metadataObj);
                    }
                } catch (e) {
                    console.error("Error parsing metadata for header extraction:", e);
                    message.error("Failed to parse metadata for header extraction.");
                    headers = [];
                }
            }
            setExtractedHeaders(headers);

            if (recordData.data.embeddingEnabled && headers.length > 0) {
                setEmbeddingEnabled(true);
                setSelectedEmbeddingFields(recordData.data.embeddingFields || []);
            } else {
                setEmbeddingEnabled(false);
                setSelectedEmbeddingFields([]);
            }
            // Set form fields including the potentially modified ones
            baseFormProps.form.setFieldsValue({
                ...recordData.data,
                metadata: typeof currentMetadata === 'string' ? currentMetadata : JSON.stringify(currentMetadata, null, 2),
            });
        } else if (!currentRecordId) { // Reset when drawer is closed or no recordId
            setExtractedHeaders([]);
            setEmbeddingEnabled(false);
            setSelectedEmbeddingFields([]);
            if (baseFormProps.form) { // Clear form if it exists
                baseFormProps.form.resetFields();
            }
        }
    }, [recordData, baseFormProps.form, currentRecordId]);

    const handleMetadataChange = (metadataStr: string) => {
        let currentHeaders: string[] = [];
        if (!metadataStr) {
            setExtractedHeaders([]);
            // Keep embedding enabled status as is, but clear fields if headers are gone
            setSelectedEmbeddingFields([]);
            return;
        }
        try {
            const parsed = JSON.parse(metadataStr);
            if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
                currentHeaders = Object.keys(parsed[0]);
            } else if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                currentHeaders = Object.keys(parsed);
            }

            if (JSON.stringify(currentHeaders) !== JSON.stringify(extractedHeaders)) {
                setExtractedHeaders(currentHeaders);
                // If headers change significantly, user might need to re-evaluate selections.
                // For now, clear selected fields to force re-selection based on new headers.
                setSelectedEmbeddingFields([]);
            }

        } catch (error) {
            // If metadata becomes invalid, clear headers.
            // User will see an error from the validator.
            setExtractedHeaders([]);
            setSelectedEmbeddingFields([]);
        }
    };

    const handleFormProcessingAndSubmit = async (values: any) => {
        let processedMetadata = values.metadata;
        if (typeof values.metadata === 'string') {
            try {
                processedMetadata = JSON.parse(values.metadata);
            } catch (e) {
                message.error(`Invalid JSON in metadata: ${(e as Error).message}`);
                return Promise.reject(new Error(`Invalid JSON in metadata: ${(e as Error).message}`));
            }
        }

        const payload: any = {
            ...values,
            metadata: processedMetadata,
        };

        if (typeof payload.metadata !== 'object' || payload.metadata === null) {
            message.error('Processed metadata is not a valid JSON object or array of objects.');
            return Promise.reject(new Error('Processed metadata is not a valid JSON object or array of objects.'));
        }
        // Check if it's an array, and if so, if its elements are objects (unless it's an empty array which is fine)
        if (Array.isArray(payload.metadata) && payload.metadata.length > 0 && typeof payload.metadata[0] !== 'object') {
            message.error('If metadata is an array, its elements must be objects.');
            return Promise.reject(new Error('If metadata is an array, its elements must be objects.'));
        }


        if (embeddingEnabled && extractedHeaders.length > 0 && selectedEmbeddingFields.length > 0) {
            payload.embeddingEnabled = true;
            payload.embeddingFields = selectedEmbeddingFields;
        } else {
            payload.embeddingEnabled = false;
            payload.embeddingFields = [];
        }
        delete payload.embeddingEnabledCheckbox;


        if (baseFormProps?.onFinish) {
            return baseFormProps.onFinish(payload);
        }

        return Promise.reject(new Error("Form submission setup error."));
    };

    const formProps = {
        ...baseFormProps,
        onFinish: handleFormProcessingAndSubmit,
    };

    const saveButtonProps = baseSaveButtonProps;

    const formatMetadata = (metadata: any, embeddingEnabledStatus?: boolean, embeddingFieldsList?: string[]) => {
        if (!metadata) return '-';
        try {
            const metadataObj = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
            const displayFields = [];

            if (typeof metadataObj === 'object' && metadataObj !== null && !Array.isArray(metadataObj)) {
                if (metadataObj.header) displayFields.push(`Header: ${metadataObj.header}`);
                if (metadataObj.label) displayFields.push(`Label: ${metadataObj.label}`);
                if (metadataObj['Key word']) displayFields.push(`Keyword: ${metadataObj['Key word']}`);
            }


            if (embeddingEnabledStatus && embeddingFieldsList && embeddingFieldsList.length > 0) {
                displayFields.push(`Embedding: Enabled (${embeddingFieldsList.join(', ')})`);
            } else if (embeddingEnabledStatus) {
                displayFields.push(`Embedding: Enabled (No fields selected)`);
            }


            return displayFields.length > 0
                ? displayFields.join('\n')
                : JSON.stringify(metadataObj, null, 2).substring(0, 100) + (JSON.stringify(metadataObj, null, 2).length > 100 ? '...' : ''); // Fallback to stringified short version
        } catch (e) {
            return 'Invalid metadata format';
        }
    };

    const getFullMetadata = (metadata: any) => {
        if (!metadata) return '-';
        try {
            const metadataObj = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
            return JSON.stringify(metadataObj, null, 2);
        } catch (e) {
            return 'Invalid metadata format';
        }
    };

    return (
        <>
            <List
                headerButtons={[
                    <CreateButton key="create" />,
                    <Button
                        key="upload"
                        type="primary"
                        icon={<UploadOutlined />}
                        onClick={() => navigate("/datasets/upload")}
                    >
                        Upload Dataset
                    </Button>
                ]}
            >
                <Table
                    {...tableProps}
                    rowKey="id"
                    onRow={(record: BaseRecord & { metadata?: any, embeddingEnabled?: boolean, embeddingFields?: string[] }) => {
                        return {
                            onClick: () => {
                                setRecordId(record.id);
                                // Reset states before showing new record, useEffect will populate them
                                setExtractedHeaders([]);
                                setEmbeddingEnabled(false);
                                setSelectedEmbeddingFields([]);
                                show(record.id);
                            },
                            style: { cursor: "pointer" },
                        };
                    }}
                >
                    <Table.Column
                        dataIndex="task"
                        title="Task"
                        filterDropdown={(props) => (
                            <FilterDropdown
                                {...props}
                                clearFilters={() => {
                                    props.clearFilters?.();
                                    // @ts-expect-error confirm may not be defined
                                    props.confirm();
                                }}
                            >
                                <Input
                                    placeholder="Search task"
                                    prefix={<SearchOutlined />}
                                    autoFocus
                                    // @ts-expect-error confirm may not be defined
                                    onPressEnter={() => props.confirm()}
                                />
                            </FilterDropdown>
                        )}
                        render={(text: string) => (
                            <Typography.Text strong>{text}</Typography.Text>
                        )}
                    />
                    <Table.Column
                        dataIndex="type"
                        title="Type"
                        filterDropdown={(props) => (
                            <FilterDropdown
                                {...props}
                                clearFilters={() => {
                                    props.clearFilters?.();
                                    // @ts-expect-error confirm may not be defined
                                    props.confirm();
                                }}
                            >
                                <Input
                                    placeholder="Search type"
                                    prefix={<SearchOutlined />}
                                    autoFocus
                                    // @ts-expect-error confirm may not be defined
                                    onPressEnter={() => props.confirm()}
                                />
                            </FilterDropdown>
                        )}
                        render={(text: string) => (
                            <Typography.Text>
                                {text}
                            </Typography.Text>
                        )}
                    />
                    <Table.Column
                        dataIndex="metadata"
                        title="Metadata"
                        render={(metadata: any, record: BaseRecord & { embeddingEnabled?: boolean, embeddingFields?: string[] }) => (
                            <Tooltip title={getFullMetadata(metadata)}>
                                <Typography.Text style={{ whiteSpace: 'pre-wrap' }}>
                                    {formatMetadata(metadata, record.embeddingEnabled, record.embeddingFields)}
                                </Typography.Text>
                            </Tooltip>
                        )}
                    />
                    <Table.Column
                        dataIndex="createdAt"
                        title="Created At"
                        render={(date: string) => (
                            <Typography.Text>
                                {new Date(date).toLocaleString()}
                            </Typography.Text>
                        )}
                    />
                    <Table.Column
                        title="Actions"
                        dataIndex="actions"
                        render={(_, record: BaseRecord) => (
                            <Space onClick={(e) => e.stopPropagation()}>
                                <DeleteButton hideText size="small" recordItemId={record.id} />
                            </Space>
                        )}
                    />
                </Table>
            </List>
            <Drawer {...drawerProps} width={720} afterOpenChange={(open) => {
                if (!open) { // Reset states when drawer is closed
                    setExtractedHeaders([]);
                    setEmbeddingEnabled(false);
                    setSelectedEmbeddingFields([]);
                }
            }}>
                <div style={{ textAlign: 'right', marginBottom: '10px' }}>
                    <SaveButton {...saveButtonProps} />
                </div>
                <Form {...formProps} layout="vertical">
                    <Form.Item
                        label="Task"
                        name="task"
                        rules={[{ required: true }]}
                    >
                        <Input placeholder="e.g., classification, regression, clustering" />
                    </Form.Item>
                    <Form.Item
                        label="Type"
                        name="type"
                        rules={[{ required: true }]}
                    >
                        <Input placeholder="e.g., train, validation, test, predict" />
                    </Form.Item>
                    <Form.Item
                        label="Metadata (JSON)"
                        name="metadata"
                        rules={[{ required: true, message: "Metadata is required." }, {
                            validator: async (_, value) => {
                                if (!value && typeof value !== 'string') { // Allow empty string for initial state before user input
                                    setExtractedHeaders([]);
                                    // Don't change embeddingEnabled, let user control it or useEffect handle it
                                    setSelectedEmbeddingFields([]);
                                    return Promise.reject(new Error('Metadata must be a non-empty string.'));
                                }
                                try {
                                    const parsed = JSON.parse(value);
                                    let currentHeaders: string[] = [];

                                    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
                                        currentHeaders = Object.keys(parsed[0]);
                                    } else if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                                        currentHeaders = Object.keys(parsed);
                                    } else if (Array.isArray(parsed) && parsed.length === 0) { // Empty array is valid JSON
                                        currentHeaders = [];
                                    }
                                    else { // Not an object or array of objects
                                        setExtractedHeaders([]);
                                        setSelectedEmbeddingFields([]);
                                        return Promise.reject(new Error('Metadata must be a valid JSON object or an array of objects.'));
                                    }

                                    // Update headers state only if they actually change
                                    // This check was moved to handleMetadataChange for direct input changes
                                    // Here, we ensure that on validation (e.g. initial load), headers are set.
                                    setExtractedHeaders(currentHeaders);

                                    return Promise.resolve();
                                } catch (e) {
                                    setExtractedHeaders([]);
                                    setSelectedEmbeddingFields([]);
                                    return Promise.reject(new Error('Invalid JSON format. Please check your syntax.'));
                                }
                            }
                        }]}
                        getValueProps={(value) => ({ // Ensure value is always string for TextArea
                            value: typeof value === 'string' ? value : JSON.stringify(value, null, 2)
                        })}
                        // normalize to ensure we are always dealing with string for parsing
                        normalize={(value) => (typeof value === 'object' ? JSON.stringify(value, null, 2) : value)}
                    >
                        <Input.TextArea
                            rows={10}
                            placeholder={'Enter JSON metadata (e.g., {"key": "value"} or [{"key1": "val1"}, {"key2": "val2"}])'}
                            onChange={(e) => {
                                const val = e.target.value;
                                // Update metadata in form for validation
                                baseFormProps.form?.setFieldsValue({ metadata: val });
                                handleMetadataChange(val); // Update headers based on current input
                                baseFormProps.form?.validateFields(['metadata']); // Trigger re-validation
                            }}
                        />
                    </Form.Item>

                    {extractedHeaders.length > 0 && (
                        <Form.Item
                            label="Enable Embedding"
                            name="embeddingEnabledCheckbox"
                            valuePropName="checked"
                        >
                            <Checkbox
                                checked={embeddingEnabled}
                                onChange={(e) => {
                                    setEmbeddingEnabled(e.target.checked);
                                    if (!e.target.checked) {
                                        setSelectedEmbeddingFields([]);
                                    }
                                    // Trigger validation of embeddingFields when checkbox changes
                                    baseFormProps.form?.validateFields(['embeddingFields']);
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
                            rules={[{
                                validator: async (_, _formValue) => { // _formValue is the value from Form.Item, we use state `selectedEmbeddingFields`
                                    if (embeddingEnabled && selectedEmbeddingFields.length === 0) {
                                        return Promise.reject(new Error('Please select at least one field for embedding.'));
                                    }
                                    return Promise.resolve();
                                }
                            }]}
                        >
                            <Select
                                mode="multiple"
                                allowClear
                                style={{ width: '100%' }}
                                placeholder="Please select fields for embedding"
                                value={selectedEmbeddingFields}
                                onChange={(newSelectedFields) => {
                                    setSelectedEmbeddingFields(newSelectedFields);
                                    // Trigger validation when selection changes
                                    baseFormProps.form?.validateFields(['embeddingFields']);
                                }}
                                options={extractedHeaders.map(header => ({ label: header, value: header }))}
                                loading={formLoading}
                                disabled={formLoading || extractedHeaders.length === 0}
                            />
                        </Form.Item>
                    )}
                </Form>
            </Drawer>
        </>
    );
}; 
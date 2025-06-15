import React from 'react';
import { Form, Input, Select, Space, InputNumber, Typography, Button, Tooltip } from 'antd';
import { ModelSelector } from './ModelSelector';
import { PromptSelector } from './PromptSelector';
import { CodeOutlined, InfoCircleOutlined } from '@ant-design/icons';

interface SchemaBasedParameterInputsProps {
    schema: Record<string, any>;
    formNamePath: (string | number)[];
    translate: (key: string, defaultMessage?: string) => string;
    previousNodeName?: string;
}

export const SchemaBasedParameterInputs: React.FC<SchemaBasedParameterInputsProps> = ({ schema, formNamePath, translate, previousNodeName = 'Previous Node' }) => {
    const form = Form.useFormInstance();

    if (!schema || typeof schema !== 'object' || !schema.properties || typeof schema.properties !== 'object') {
        return (
            <Typography.Text type="secondary">
                {translate("workflows.parameters.noSchema", "No input schema defined for this node type.")}
            </Typography.Text>
        );
    }

    const properties = schema.properties;
    const requiredFields = schema.required || [];

    // Add this custom validator to your Form.Item rules for array type inputs
    const validateNodeReference = (rule, value) => {
        // Skip validation for non-node references
        if (!value || typeof value !== 'string' || !value.includes('$')) {
            return Promise.resolve();
        }

        console.log('Validating expression:', value); // Debug log

        // More permissive regex that handles various formats
        const nodeNameMatch = value.match(/\$\(\s*['"]([^'"]+)['"]\s*\)/);

        if (!nodeNameMatch) {
            console.log('No match found in expression'); // Debug log
            return Promise.reject(`Invalid node reference format`);
        }

        const referencedNodeName = nodeNameMatch[1];
        console.log('Found node reference:', referencedNodeName); // Debug log

        const nodes = form.getFieldValue('nodes') || [];
        const currentNodeIndex = formNamePath[0];

        if (typeof currentNodeIndex !== 'number') {
            return Promise.resolve(); // Can't determine position, pass validation
        }

        // Get all nodes that come before this one
        const availableNodeNames = nodes
            .filter((node, idx) => idx < currentNodeIndex)
            .map(node => node.name)
            .filter(Boolean);

        console.log('Available nodes:', availableNodeNames); // Debug log

        if (!availableNodeNames.includes(referencedNodeName)) {
            return Promise.reject(`Referenced node "${referencedNodeName}" doesn't exist or is not a previous node`);
        }

        return Promise.resolve();
    };

    return (
        <Space direction="vertical" style={{ width: '100%' }}>
            {Object.entries(properties).map(([key, propSchema]: [string, any], index: number) => {
                const baseLabel = propSchema.title || key;
                const labelText = baseLabel;
                const labelWithTooltip = propSchema.description ? (
                    <Space>
                        {baseLabel}
                        <Tooltip title={propSchema.description}>
                            <InfoCircleOutlined style={{ color: 'rgba(0, 0, 0, 0.45)', cursor: 'help' }} />
                        </Tooltip>
                    </Space>
                ) : baseLabel;
                const rules: any[] = [];
                const namePath = [...formNamePath, key];
                const uniqueKey = `${formNamePath.join('-')}-${key}-${index}`;

                if (requiredFields.includes(key)) {
                    rules.push({
                        required: true,
                        message: translate("workflows.errors.missingParamValue", `Parameter '${labelText}' is required.`)
                    });
                }

                let inputElement: React.ReactNode;

                switch (propSchema.type) {
                    case "integer":
                    case "number":
                        if (propSchema.minimum !== undefined) {
                            rules.push({ type: 'number', min: propSchema.minimum, message: `${labelText} must be at least ${propSchema.minimum}` });
                        }
                        if (propSchema.maximum !== undefined) {
                            rules.push({ type: 'number', max: propSchema.maximum, message: `${labelText} cannot exceed ${propSchema.maximum}` });
                        }
                        inputElement = <InputNumber style={{ width: '100%' }} placeholder={translate("workflows.placeholders.enterNumber", "Enter a number")} />;
                        break;
                    case "boolean":
                        inputElement = (
                            <Select placeholder={translate("workflows.placeholders.selectBoolean", "Select True or False")}>
                                <Select.Option value={true}>True</Select.Option>
                                <Select.Option value={false}>False</Select.Option>
                            </Select>
                        );
                        break;
                    case "model":
                        inputElement = <ModelSelector placeholder={translate("workflows.placeholders.selectModel", "Select a model")} />;
                        break;
                    case "prompt":
                        inputElement = <PromptSelector placeholder={translate("workflows.placeholders.selectPrompt", "Select a prompt template")} />;
                        break;
                    case "object":
                        rules.push({
                            validator: async (_, value) => {
                                if (!value || value.trim() === '') {
                                    return Promise.resolve(); // Allow empty value if not required
                                }
                                try {
                                    JSON.parse(value);
                                    return Promise.resolve();
                                } catch (e) {
                                    return Promise.reject(new Error(translate("workflows.errors.invalidJson", "Must be a valid JSON object")));
                                }
                            }
                        });
                        inputElement = (
                            <Input.TextArea
                                rows={4}
                                placeholder={translate("workflows.placeholders.jsonObject", "Enter JSON object")}
                            />
                        );
                        break;
                    case "text":
                        inputElement = <Input.TextArea rows={4} placeholder={translate("workflows.placeholders.parameterValue", "Enter value")} />;
                        break;
                    case "array":
                        inputElement = (
                            <Input
                                placeholder={translate("workflows.placeholders.parameterValue", "Enter value")}
                                suffix={
                                    <Button
                                        type="text"
                                        size="small"
                                        onClick={() => {
                                            const currentValues = form.getFieldsValue();
                                            const nodes = currentValues.nodes || [];
                                            const nodeIndex = formNamePath[0];
                                            const paramKey = namePath[namePath.length - 1];

                                            if (typeof nodeIndex !== 'number') {
                                                console.error("SchemaBasedParameterInputs: Node index is not a number in button onClick.", formNamePath);
                                                return;
                                            }

                                            // Get all available node names for validation
                                            const availableNodeNames = nodes
                                                .filter((node, idx) => idx < nodeIndex) // Only consider nodes that come before the current one
                                                .map(node => node.name)
                                                .filter(Boolean); // Filter out undefined/empty names

                                            // Check if previousNodeName is valid
                                            let nodeToReference = previousNodeName;
                                            if (!availableNodeNames.includes(previousNodeName) && availableNodeNames.length > 0) {
                                                // If specified previousNodeName isn't valid, use the most recent node instead
                                                nodeToReference = availableNodeNames[availableNodeNames.length - 1];
                                            } else if (availableNodeNames.length === 0) {
                                                // If no previous nodes are available, show a warning and prevent the action
                                                console.warn("Cannot add reference: No previous nodes available");
                                                return;
                                            }

                                            const currentNodeData = nodes[nodeIndex];
                                            const currentValue = currentNodeData?.parameters?.[paramKey] || '';

                                            let expression;
                                            const pathMatch = currentValue.match(/={{ \$\(['"].*?['"]\)(.*?)}}/); // Non-greedy match for path
                                            if (pathMatch) {
                                                const path = pathMatch[1] || '.output'; // Path is capture group 1, default to .output
                                                expression = `={{ $('${nodeToReference}')${path}}}`;
                                            } else {
                                                expression = `={{ $('${nodeToReference}').output}}`;
                                            }

                                            // Deep copy nodes to avoid direct state mutation issues
                                            const updatedNodes = JSON.parse(JSON.stringify(nodes));

                                            if (!updatedNodes[nodeIndex]) {
                                                updatedNodes[nodeIndex] = { parameters: {} };
                                            }
                                            if (!updatedNodes[nodeIndex].parameters) {
                                                updatedNodes[nodeIndex].parameters = {};
                                            }

                                            updatedNodes[nodeIndex].parameters[paramKey] = expression;
                                            form.setFieldsValue({ nodes: updatedNodes });
                                        }}
                                        style={{ marginRight: -8 }}
                                        title={translate("workflows.actions.addPreviousNodeExpression", "Add previous node expression")}
                                        disabled={form.getFieldValue('nodes')?.filter((_, idx) => idx < formNamePath[0]).length === 0}
                                    >
                                        <CodeOutlined />
                                    </Button>
                                }
                            />
                        );
                        // Add the validator to the rules array
                        rules.push({
                            validator: validateNodeReference
                        });
                        break;
                    case "string":
                    default:
                        if (propSchema.pattern) {
                            rules.push({ pattern: new RegExp(propSchema.pattern), message: `${labelText} must match pattern: ${propSchema.pattern}` });
                        }
                        if (propSchema.minLength !== undefined) {
                            rules.push({ min: propSchema.minLength, message: `${labelText} must be at least ${propSchema.minLength} characters long` });
                        }
                        if (propSchema.maxLength !== undefined) {
                            rules.push({ max: propSchema.maxLength, message: `${labelText} cannot exceed ${propSchema.maxLength} characters` });
                        }
                        if (propSchema.enum && Array.isArray(propSchema.enum)) {
                            inputElement = (
                                <Select placeholder={translate("workflows.placeholders.selectOption", "Select an option")}>
                                    {propSchema.enum.map((enumValue: any) => (
                                        <Select.Option key={String(enumValue)} value={enumValue}>{String(enumValue)}</Select.Option>
                                    ))}
                                </Select>
                            );
                        } else if (propSchema.format === 'textarea') {
                            inputElement = <Input.TextArea rows={4} placeholder={translate("workflows.placeholders.parameterValue", "Enter value")} />;
                        } else {
                            inputElement = <Input placeholder={translate("workflows.placeholders.parameterValue", "Enter value")} />;
                        }
                        break;
                }

                return (
                    <Form.Item
                        key={uniqueKey}
                        label={labelWithTooltip}
                        name={namePath}
                        rules={rules}
                        initialValue={propSchema.default}
                        style={{ marginBottom: 8 }}
                    >
                        {inputElement}
                    </Form.Item>
                );
            })}
            {Object.keys(properties).length === 0 && (
                <Typography.Text type="secondary">
                    {translate("workflows.parameters.noParameters", "No parameters defined in schema.")}
                </Typography.Text>
            )}
        </Space>
    );
};



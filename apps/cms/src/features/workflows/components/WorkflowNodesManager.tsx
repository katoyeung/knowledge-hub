import React, { useState, useEffect } from "react";
import {
    Button,
    Form,
    Input,
    Space,
    Typography,
    Drawer,
    Menu,
    FormInstance,
    Popconfirm,
} from "antd";
import {
    MinusCircleOutlined,
    PlusOutlined,
    MenuOutlined,
    ExpandOutlined,
    MinusOutlined,
} from "@ant-design/icons";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCustom } from "@refinedev/core";
import { SchemaBasedParameterInputs } from './SchemaBasedParameterInputs';

interface FetchedNodeTemplate {
    id: string;
    name: string;
    description?: string;
    type: string;
    inputSchema: Record<string, any>;
    outputSchema: Record<string, any>;
    parameters: {
        service: string;
        method: string;
        params: string[];
    };
}

interface FormNodeTemplate {
    key: string;
    name: string;
    description?: string;
    type: string;
    parameters: Record<string, any>;
    inputSchema: Record<string, any>;
    outputSchema: Record<string, any>;
}

// Draggable Item Wrapper Component
const SortableNodeItem = ({
    id,
    children,
}: {
    id: React.Key;
    children: React.ReactNode;
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: String(id) });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        cursor: "move",
        zIndex: isDragging ? 10 : "auto",
        opacity: isDragging ? 0.7 : 1,
        position: "relative",
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes}>
            <Space align="center" style={{ width: "100%" }}>
                <span {...listeners} style={{ cursor: "grab" }}>
                    <MenuOutlined />
                </span>
                <div style={{ flexGrow: 1 }}>{children}</div>
            </Space>
        </div>
    );
};

interface WorkflowNodesManagerProps {
    form: FormInstance;
    translate: (key: string, options?: any, defaultMessage?: string) => string;
    apiUrl: string;
    formListName: string;
    onLoadingStatusChange?: (isLoading: boolean) => void;
}

// Add this utility function to generate unique names
const generateUniqueName = (baseName: string, existingNames: string[], currentIndex?: number) => {
    let uniqueName = baseName;
    let counter = 1;

    // Filter out the current node's name from the check to allow keeping the same name
    const namesToCheck = currentIndex !== undefined
        ? existingNames.filter((_, i) => i !== currentIndex)
        : existingNames;

    // Check if the name already exists and increment counter until we find a unique name
    while (namesToCheck.includes(uniqueName)) {
        // Check if the name already ends with a number
        const matches = baseName.match(/^(.*?)(\d+)$/);
        if (matches) {
            // If it ends with a number, increment that number
            const nameBase = matches[1];
            const nameCounter = parseInt(matches[2], 10);
            counter = nameCounter + 1;
            baseName = nameBase; // Remove the number part for clean incrementation
        }
        uniqueName = `${baseName}${counter}`;
        counter++;
    }

    return uniqueName;
};

// Add this function to normalize all node names in the workflow
const normalizeNodeNames = () => {
    const currentNodes = form.getFieldValue(formListName) || [];
    if (currentNodes.length === 0) return;

    // Create a map to track used base names and their count
    const baseNameMap = new Map<string, number>();
    const updatedNodes = [...currentNodes];
    let hasChanges = false;

    // First pass - collect all base names
    currentNodes.forEach(node => {
        if (!node.name) return;

        // Extract base name (without number suffix)
        const baseNameMatch = node.name.match(/^(.*?)(?:\d+)?$/);
        const baseName = baseNameMatch?.[1] || node.name;

        // Count occurrences of this base name
        baseNameMap.set(baseName, (baseNameMap.get(baseName) || 0) + 1);
    });

    // Second pass - rename nodes where needed
    currentNodes.forEach((node, index) => {
        if (!node.name) return;

        // Extract current parts
        const nameMatch = node.name.match(/^(.*?)(?:(\d+))?$/);
        if (!nameMatch) return;

        const baseName = nameMatch[1];
        const currentNum = nameMatch[2] ? parseInt(nameMatch[2], 10) : null;

        // Only add numbers if there are multiple nodes with this base name
        if (baseNameMap.get(baseName) > 1) {
            // For each base name, keep track of the current sequence number
            const seqKey = `${baseName}_sequence`;
            baseNameMap.set(seqKey, (baseNameMap.get(seqKey) || 0) + 1);
            const newSequence = baseNameMap.get(seqKey) || 1;

            // Only update if the current number doesn't match the expected sequence
            if (currentNum !== newSequence) {
                updatedNodes[index] = {
                    ...updatedNodes[index],
                    name: `${baseName}${newSequence}`
                };
                hasChanges = true;
            }
        } else if (currentNum !== null) {
            // If there's only one node with this base name, remove any numeric suffix
            updatedNodes[index] = {
                ...updatedNodes[index],
                name: baseName
            };
            hasChanges = true;
        }
    });

    // Update form if changes were made
    if (hasChanges) {
        form.setFieldsValue({ [formListName]: updatedNodes });
    }
};

export const WorkflowNodesManager: React.FC<WorkflowNodesManagerProps> = ({
    form,
    translate,
    apiUrl,
    formListName,
    onLoadingStatusChange,
}) => {
    const { data: fetchedTemplatesData, isLoading: isLoadingTemplates } =
        useCustom<FetchedNodeTemplate[]>({
            url: `${apiUrl}/workflow-actions`,
            method: "get",
        });

    useEffect(() => {
        onLoadingStatusChange?.(isLoadingTemplates);
    }, [isLoadingTemplates, onLoadingStatusChange]);

    const [availableNodeTemplates, setAvailableNodeTemplates] = useState<
        FormNodeTemplate[]
    >([]);
    const [isDrawerVisible, setIsDrawerVisible] = useState(false);
    const [nodeSearchTerm, setNodeSearchTerm] = useState("");

    useEffect(() => {
        if (fetchedTemplatesData?.data) {
            const transformedTemplates = fetchedTemplatesData.data.map(
                (template) => ({
                    key: template.id,
                    name: template.name,
                    description: template.description,
                    type: template.type,
                    parameters: Object.entries(
                        template.inputSchema?.properties || {}
                    ).reduce((acc, [key, schema]: [string, any]) => {
                        if (schema.default !== undefined) {
                            acc[key] = schema.default;
                        }
                        return acc;
                    }, {} as Record<string, any>),
                    inputSchema: template.inputSchema || {},
                    outputSchema: template.outputSchema || {},
                })
            );
            setAvailableNodeTemplates(transformedTemplates);
        }
    }, [fetchedTemplatesData]);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleAddNodeFromTemplateAndCloseDrawer = (template: FormNodeTemplate) => {
        const instanceUniqueKey = `node_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const currentNodes = form.getFieldValue(formListName) || [];
        const previousNodeName = currentNodes.length > 0 ? currentNodes[currentNodes.length - 1].name : '';

        // Create a unique node name
        const existingNodeNames = currentNodes.map(node => node.name);
        const uniqueName = generateUniqueName(template.name, existingNodeNames);

        const processedParameters = { ...(template.parameters || {}) };
        if (previousNodeName && template.inputSchema?.properties) {
            Object.entries(template.inputSchema.properties).forEach(([paramKey, paramSchema]: [string, any]) => {
                if (paramSchema.type === "array") {
                    processedParameters[paramKey] = `={{ $('${previousNodeName}').output}}`;
                }
            });
        }

        const nodeToAdd = {
            name: uniqueName, // Use the unique name here
            type: template.type,
            parameters: processedParameters,
            inputSchema: { ...(template.inputSchema || {}) },
            outputSchema: { ...(template.outputSchema || {}) },
            templateKey: template.key,
            uniqueKeyForDnd: instanceUniqueKey,
            isMinimized: false,
            previousNodeName: previousNodeName,
        };

        form.setFieldsValue({ [formListName]: [...currentNodes, nodeToAdd] });

        // Call normalizeNodeNames after adding the node
        setTimeout(() => normalizeNodeNames(), 0);

        setIsDrawerVisible(false);
        setNodeSearchTerm("");
    };

    const getNodeKeyForDnd = (nodeData: any): React.Key => {
        return nodeData?.uniqueKeyForDnd;
    };

    return (
        <>
            <Typography.Title level={5}>{translate("workflows.fields.nodes", "Nodes")}</Typography.Title>
            <Form.List name={formListName}>
                {(fields, { remove, move }) => {
                    const currentNodes = form.getFieldValue(formListName) || [];

                    const handleDragEndScoped = (event: DragEndEvent) => {
                        const { active, over } = event;
                        if (active.id !== over?.id) {
                            const nodes = form.getFieldValue(formListName) || [];
                            const oldIndex = nodes.findIndex((node: any) => getNodeKeyForDnd(node) === active.id);
                            const newIndex = nodes.findIndex((node: any) => getNodeKeyForDnd(node) === over?.id);

                            if (oldIndex !== -1 && newIndex !== -1) {
                                // First perform the move operation
                                move(oldIndex, newIndex);

                                // Get the nodes after the move
                                const updatedNodes = form.getFieldValue(formListName) || [];

                                // Update previousNodeName for all nodes while preserving all other fields
                                const nodesWithPreviousNames = updatedNodes.map((node: any, index: number) => {
                                    // Get the previous node's name based on the new order
                                    const previousNode = index > 0 ? updatedNodes[index - 1] : null;
                                    const previousNodeName = previousNode ? previousNode.name : '';

                                    // Update parameters that reference the previous node
                                    const updatedParameters = { ...node.parameters };
                                    Object.keys(updatedParameters).forEach(key => {
                                        const value = updatedParameters[key];
                                        if (typeof value === 'string' && /={{ \$\(['"].*?['"]\)(.*?)}}/.test(value)) {
                                            updatedParameters[key] = value.replace(
                                                /={{ \$\(['"].*?['"]\)(.*?)}}/, // Match {{ $('ANYTHING')$(PATH_GROUP) }}
                                                `={{ $('${previousNodeName}')$1}}`  // Replace with new node name, keep path group $1
                                            );
                                        }
                                    });

                                    return {
                                        ...node,
                                        previousNodeName,
                                        parameters: updatedParameters,
                                        // Preserve all other fields
                                        type: node.type,
                                        inputSchema: node.inputSchema,
                                        outputSchema: node.outputSchema,
                                        templateKey: node.templateKey,
                                        uniqueKeyForDnd: node.uniqueKeyForDnd,
                                        isMinimized: node.isMinimized
                                    };
                                });

                                // Update the form with the new nodes
                                form.setFieldsValue({ [formListName]: nodesWithPreviousNames });

                                // Force a re-render by updating the form again
                                setTimeout(() => {
                                    form.setFieldsValue({ [formListName]: nodesWithPreviousNames });
                                }, 0);
                            }
                        }

                        // Add this line at the end of the function
                        setTimeout(() => normalizeNodeNames(), 0);
                    };

                    const toggleNodeMinimization = (index: number) => {
                        const nodes = form.getFieldValue(formListName) || [];
                        const updatedNodes = nodes.map((node: any, i: number) => {
                            if (i === index) {
                                return { ...node, isMinimized: !node.isMinimized };
                            }
                            return node;
                        });
                        form.setFieldsValue({ [formListName]: updatedNodes });
                    };

                    const handleRemove = (index: number) => {
                        remove(index);
                        // Call normalizeNodeNames after removing the node
                        setTimeout(() => normalizeNodeNames(), 0);
                    };

                    return (
                        <>
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleDragEndScoped}
                            >
                                <SortableContext
                                    items={currentNodes.map((node: any) =>
                                        getNodeKeyForDnd(node)
                                    )}
                                    strategy={verticalListSortingStrategy}
                                >
                                    {fields.map((field, index) => {
                                        const currentNodeData = currentNodes[index];
                                        const dndKey = getNodeKeyForDnd(currentNodeData);
                                        if (!currentNodeData) return null;
                                        const isMinimized = currentNodeData?.isMinimized ?? false;

                                        // Destructure the field props to separate key
                                        const { key, ...fieldProps } = field;

                                        return (
                                            <SortableNodeItem key={dndKey} id={dndKey}>
                                                <Space
                                                    direction="vertical"
                                                    style={{
                                                        display: "flex",
                                                        marginBottom: 16,
                                                        border: '1px solid #d9d9d9',
                                                        borderRadius: '4px',
                                                        padding: '16px',
                                                        width: '100%',
                                                        gap: 0,
                                                        maxWidth: '800px',
                                                        margin: '0 auto 16px auto'
                                                    }}
                                                >
                                                    <Space
                                                        style={{
                                                            display: 'flex',
                                                            justifyContent: 'center',
                                                            width: '100%',
                                                            marginBottom: 8,
                                                            alignItems: 'flex-start',
                                                            gap: 8
                                                        }}
                                                    >
                                                        <Form.Item
                                                            {...fieldProps}
                                                            label={`${translate("workflows.node.position", "Position")}: ${index + 1} - ${translate("workflows.node.name", "Node Name")}`}
                                                            name={[field.name, "name"]}
                                                            rules={[
                                                                { required: true, message: translate("workflows.errors.missingNodeName", "Missing node name") }
                                                            ]}
                                                            style={{ flexGrow: 1, marginBottom: 0, maxWidth: '600px' }}
                                                            labelCol={{ span: 24 }}
                                                        >
                                                            <Input
                                                                placeholder={translate("workflows.placeholders.nodeName", "Enter node name")}
                                                                onBlur={(e) => {
                                                                    // Auto-fix duplicate names when user finishes editing
                                                                    const value = e.target.value;
                                                                    if (!value) return;

                                                                    const nodes = form.getFieldValue(formListName) || [];
                                                                    const currentNames = nodes.map(node => node.name);

                                                                    // Check if this name exists in other nodes (excluding this one)
                                                                    const isDuplicate = currentNames.filter((name, i) => i !== index && name === value).length > 0;

                                                                    if (isDuplicate) {
                                                                        // Automatically update to a unique name
                                                                        const suggestedName = generateUniqueName(value, currentNames, index);

                                                                        // Update the form
                                                                        const updatedNodes = [...nodes];
                                                                        if (updatedNodes[index]) {
                                                                            updatedNodes[index] = {
                                                                                ...updatedNodes[index],
                                                                                name: suggestedName
                                                                            };
                                                                            form.setFieldsValue({ [formListName]: updatedNodes });
                                                                        }
                                                                    }
                                                                }}
                                                            />
                                                        </Form.Item>
                                                        <Space style={{ whiteSpace: 'nowrap', gap: 8 }}>
                                                            <Button
                                                                icon={isMinimized ? <ExpandOutlined /> : <MinusOutlined />}
                                                                onClick={() => toggleNodeMinimization(index)}
                                                            />
                                                            <Popconfirm
                                                                title={translate("workflows.actions.removeNodeConfirm", "Are you sure you want to remove this node?")}
                                                                onConfirm={() => handleRemove(index)}
                                                                okText={translate("buttons.yes", "Yes")}
                                                                cancelText={translate("buttons.no", "No")}
                                                            >
                                                                <Button
                                                                    danger
                                                                    icon={<MinusCircleOutlined />}
                                                                />
                                                            </Popconfirm>
                                                        </Space>
                                                    </Space>
                                                    {!isMinimized && (
                                                        <div style={{ marginTop: 8 }}>
                                                            <SchemaBasedParameterInputs
                                                                schema={currentNodeData?.inputSchema || { properties: {} }}
                                                                formNamePath={[field.name, "parameters"]}
                                                                translate={translate}
                                                                previousNodeName={currentNodeData?.previousNodeName}
                                                                key={`${currentNodeData?.uniqueKeyForDnd}-${currentNodeData?.previousNodeName}`}
                                                            />
                                                            <Form.Item
                                                                {...fieldProps}
                                                                name={[field.name, "type"]}
                                                                hidden
                                                            >
                                                                <Input />
                                                            </Form.Item>
                                                            <Form.Item
                                                                {...fieldProps}
                                                                name={[field.name, "uniqueKeyForDnd"]}
                                                                hidden
                                                            >
                                                                <Input />
                                                            </Form.Item>
                                                            <Form.Item
                                                                {...fieldProps}
                                                                name={[field.name, "inputSchema"]}
                                                                hidden
                                                            >
                                                                <Input />
                                                            </Form.Item>
                                                            <Form.Item
                                                                {...fieldProps}
                                                                name={[field.name, "outputSchema"]}
                                                                hidden
                                                            >
                                                                <Input />
                                                            </Form.Item>
                                                            <Form.Item
                                                                {...fieldProps}
                                                                name={[field.name, "templateKey"]}
                                                                hidden
                                                            >
                                                                <Input />
                                                            </Form.Item>
                                                        </div>
                                                    )}
                                                    <Form.Item
                                                        {...fieldProps}
                                                        name={[field.name, "isMinimized"]}
                                                        hidden
                                                    >
                                                        <Input />
                                                    </Form.Item>
                                                </Space>
                                            </SortableNodeItem>
                                        );
                                    })}
                                </SortableContext>
                            </DndContext>
                        </>
                    );
                }}
            </Form.List>
            <Form.Item style={{
                position: 'fixed',
                right: '32px',
                top: '40%',
                transform: 'translateY(-50%)',
                zIndex: 1000
            }}>
                <Button
                    type="primary"
                    shape="circle"
                    icon={<PlusOutlined />}
                    onClick={() => setIsDrawerVisible(true)}
                    loading={isLoadingTemplates}
                    size="large"
                    title={translate("buttons.addNode", "Add Node")}
                />
            </Form.Item>
            <Drawer
                title={translate("workflows.actions.addNode", "Add Node")}
                placement="right"
                onClose={() => {
                    setIsDrawerVisible(false);
                    setNodeSearchTerm("");
                }}
                open={isDrawerVisible}
                width={400}
            >
                <Input.Search
                    placeholder={translate("workflows.placeholders.searchNode", "Search node templates...")}
                    onChange={(e) => setNodeSearchTerm(e.target.value)}
                    value={nodeSearchTerm}
                    style={{ marginBottom: 16 }}
                    allowClear
                />
                <Menu selectable={false} onClick={({ key }) => {
                    const template = availableNodeTemplates.find(t => t.key === key);
                    if (template) {
                        handleAddNodeFromTemplateAndCloseDrawer(template);
                    }
                }}>
                    {availableNodeTemplates
                        .filter(template => template.name.toLowerCase().includes(nodeSearchTerm.toLowerCase()))
                        .map(template => (
                            <Menu.Item
                                key={template.key}
                                style={{
                                    height: 'auto',
                                    paddingTop: '8px',
                                    paddingBottom: '8px',
                                    lineHeight: 'initial'
                                }}
                            >
                                <div>{template.name}</div>
                                {template.description && (
                                    <div style={{ fontSize: '0.85em', color: 'gray', whiteSpace: 'normal', lineHeight: '1.3', marginTop: '4px' }}>
                                        {template.description}
                                    </div>
                                )}
                            </Menu.Item>
                        ))}
                </Menu>
            </Drawer>
        </>
    );
};

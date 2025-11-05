'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Play, Settings, Zap, Database, ArrowLeft, X, Trash2, FileText, Search, Copy, ChevronRight, ChevronDown, Plus
} from 'lucide-react';
import { WorkflowNode, PipelineStep } from '@/lib/api/workflow';
import { datasetApi, Dataset, apiClient } from '@/lib/api';
import { RuleBasedFilterConfig } from './rule-based-filter-config';

interface WorkflowNodeConfigProps {
    node: WorkflowNode | null;
    isOpen: boolean;
    onClose: (updatedNode?: WorkflowNode) => void;
    onSave: (node: WorkflowNode) => void;
    onAutoSave?: (node: WorkflowNode) => void;
    onDelete?: (nodeId: string) => void;
    availableSteps: PipelineStep[];
    workflowNodes: WorkflowNode[];
    workflowId: string;
}

// Interactive JSON Viewer Component
// Supports configurable expansion levels:
// - maxLevel={1}: Expand only root and first level properties
// - maxLevel={2}: Expand root, first level, and second level properties (default)
// - maxLevel={3}: Expand up to third level, etc.
interface JsonViewerProps {
    data: any;
    title?: string;
    maxHeight?: string;
    maxLevel?: number; // Maximum level to expand by default (default: 2)
}

function JsonViewer({ data, title, maxHeight = "max-h-96", maxLevel = 2 }: JsonViewerProps) {
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
    const [copied, setCopied] = useState(false);

    // Initialize with configurable level expansion
    useEffect(() => {
        const initialExpanded = new Set<string>();

        // Always expand the root
        initialExpanded.add('root');

        if (data && typeof data === 'object') {
            // Expand first level properties
            Object.keys(data).forEach(key => {
                initialExpanded.add(key);

                // If maxLevel > 1, expand second level
                if (maxLevel > 1 && typeof data[key] === 'object' && data[key] !== null) {
                    if (Array.isArray(data[key])) {
                        // Expand array items
                        data[key].slice(0, 3).forEach((item, index) => {
                            if (typeof item === 'object' && item !== null) {
                                initialExpanded.add(`${key}.${index}`);
                            }
                        });
                    } else {
                        // Expand object properties
                        Object.keys(data[key]).forEach(subKey => {
                            initialExpanded.add(`${key}.${subKey}`);
                        });
                    }
                }
            });
        }

        setExpandedKeys(initialExpanded);
    }, [data, maxLevel]);

    const toggleExpanded = (key: string) => {
        const newExpanded = new Set(expandedKeys);
        if (newExpanded.has(key)) {
            newExpanded.delete(key);
        } else {
            newExpanded.add(key);
        }
        setExpandedKeys(newExpanded);
    };

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
        }
    };

    const renderValue = (value: any, key: string, path: string = ''): JSX.Element => {
        const currentPath = key === 'root' ? 'root' : (path ? `${path}.${key}` : key);
        const isExpanded = expandedKeys.has(currentPath);


        if (value === null) {
            return <span className="text-gray-400">null</span>;
        }

        if (typeof value === 'boolean') {
            return <span className="text-blue-400">{value.toString()}</span>;
        }

        if (typeof value === 'number') {
            return <span className="text-green-400">{value}</span>;
        }

        if (typeof value === 'string') {
            return <span className="text-yellow-400">"{value}"</span>;
        }

        if (Array.isArray(value)) {
            const isExpanded = expandedKeys.has(currentPath);
            return (
                <div>
                    <button
                        onClick={() => toggleExpanded(currentPath)}
                        className="flex items-center gap-1 text-gray-300 hover:text-white"
                    >
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <span>[{value.length} items]</span>
                    </button>
                    {isExpanded && (
                        <div className="ml-4 mt-1">
                            {value.map((item, index) => (
                                <div key={index} className="mb-1">
                                    <span className="text-gray-500">{index}:</span> {renderValue(item, index.toString(), currentPath)}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        if (typeof value === 'object') {
            const isExpanded = expandedKeys.has(currentPath);
            const keys = Object.keys(value);
            return (
                <div>
                    <button
                        onClick={() => toggleExpanded(currentPath)}
                        className="flex items-center gap-1 text-gray-300 hover:text-white"
                    >
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <span>{'{'} {keys.length} properties {'}'}</span>
                    </button>
                    {isExpanded && (
                        <div className="ml-4 mt-1">
                            {keys.map((k) => (
                                <div key={k} className="mb-1">
                                    <span className="text-blue-300">"{k}":</span> {renderValue(value[k], k, currentPath)}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        return <span className="text-gray-400">{String(value)}</span>;
    };

    return (
        <div className={`bg-gray-900 text-green-400 p-3 rounded text-xs font-mono overflow-auto flex-1 min-h-0 ${maxHeight}`}>
            <div className="flex items-center justify-between mb-2 sticky top-0 bg-gray-900 pb-2">
                {title && <span className="text-sm font-medium text-white">{title}</span>}
                <Button
                    size="sm"
                    variant="outline"
                    onClick={copyToClipboard}
                    className="text-gray-400 hover:text-white h-6 px-2"
                >
                    {copied ? 'Copied!' : <Copy className="h-3 w-3" />}
                </Button>
            </div>
            <div className="space-y-1">
                {renderValue(data, 'root')}
            </div>
        </div>
    );
}

// Version 2.1 - Fixed population logic with forced refresh
export function WorkflowNodeConfig({
    node,
    isOpen,
    onClose,
    onSave,
    onAutoSave,
    onDelete,
    availableSteps,
    workflowNodes
}: WorkflowNodeConfigProps) {
    // console.log('🚀 WorkflowNodeConfig Version 2.1 - Component initialized with FORCED REFRESH');
    const [nodeData, setNodeData] = useState<WorkflowNode | null>(null);
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [documents, setDocuments] = useState<Array<Record<string, any>>>([]);
    const [segments, setSegments] = useState<Array<Record<string, any>>>([]);
    const [datasetSearchTerm, setDatasetSearchTerm] = useState('');
    const [documentSearchTerm, setDocumentSearchTerm] = useState('');
    const [segmentSearchTerm, setSegmentSearchTerm] = useState('');

    // Debug: Log current state values (commented out for production)
    // console.log('Current state values:', {
    //     documentSearchTerm,
    //     segmentSearchTerm,
    //     nodeDataConfig: nodeData?.config
    // });
    // Removed refs - using value comparison instead
    // const segmentPopulatedRef = useRef(false);
    // const documentPopulatedRef = useRef(false);
    const [filteredDatasets, setFilteredDatasets] = useState<Dataset[]>([]);
    const [filteredDocuments, setFilteredDocuments] = useState<Array<Record<string, any>>>([]);
    const [filteredSegments, setFilteredSegments] = useState<Array<Record<string, any>>>([]);
    const [showDatasetDropdown, setShowDatasetDropdown] = useState(false);
    const [showDocumentDropdown, setShowDocumentDropdown] = useState(false);
    const [showSegmentDropdown, setShowSegmentDropdown] = useState(false);
    const [isLoadingDatasets, setIsLoadingDatasets] = useState(false);
    const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
    const [isLoadingSegments, setIsLoadingSegments] = useState(false);
    const [testOutput, setTestOutput] = useState<Record<string, any> | null>(null);
    const [isTesting, setIsTesting] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const [isUserTyping, setIsUserTyping] = useState(false);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Define functions first
    const loadDatasets = useCallback(async () => {
        try {
            setIsLoadingDatasets(true);
            const response = await datasetApi.getAll({ limit: 100 });
            setDatasets(response.data);
            setFilteredDatasets(response.data);
        } catch (error) {
            console.error('Failed to load datasets:', error);
            setDatasets([]);
            setFilteredDatasets([]);
        } finally {
            setIsLoadingDatasets(false);
        }
    }, []);

    const loadDocuments = useCallback(async (datasetId: string, searchTerm?: string) => {
        try {
            setIsLoadingDocuments(true);
            const response = await apiClient.get(`/datasets/${datasetId}/documents`, {
                params: { q: searchTerm || '' }
            });
            console.log('Documents loaded:', response.data.data);
            setDocuments(response.data.data);
            setFilteredDocuments(response.data.data);
        } catch (error) {
            console.error('Failed to load documents:', error);
            setDocuments([]);
            setFilteredDocuments([]);
        } finally {
            setIsLoadingDocuments(false);
        }
    }, []);

    const loadSegments = useCallback(async (datasetId: string, documentId: string, searchTerm?: string) => {
        try {
            setIsLoadingSegments(true);
            const response = await apiClient.get(`/datasets/${datasetId}/documents/${documentId}/segments`, {
                params: { q: searchTerm || '' }
            });
            setSegments(response.data.data);
            setFilteredSegments(response.data.data);
        } catch (error) {
            console.error('Failed to load segments:', error);
            setSegments([]);
            setFilteredSegments([]);
        } finally {
            setIsLoadingSegments(false);
        }
    }, []);

    useEffect(() => {
        if (node) {
            console.log('Setting nodeData from node prop:', node);
            console.log('Node config details:', {
                datasetId: node.config?.datasetId,
                documentId: node.config?.documentId,
                segmentId: node.config?.segmentId,
                fullConfig: node.config
            });
            setNodeData({ ...node });

            // Populate test output if it exists
            if (node.testOutput) {
                const optimizedOutput = optimizeTestOutput(node.testOutput);
                setTestOutput(optimizedOutput);
            } else {
                setTestOutput(null);
            }
        } else {
            console.log('Node prop is null, clearing nodeData');
            setNodeData(null);
            setTestOutput(null);
        }
    }, [node]);

    // Load datasets when component mounts
    useEffect(() => {
        loadDatasets();
    }, [loadDatasets]);

    // Load related data when popup opens for Data Source node
    useEffect(() => {
        if (isOpen && nodeData?.type === 'datasource' && nodeData.config?.datasetId) {
            console.log('Loading related data for Data Source node at', new Date().toISOString(), {
                datasetId: nodeData.config?.datasetId,
                documentId: nodeData.config?.documentId,
                segmentId: nodeData.config?.segmentId,
                fullConfig: nodeData.config
            });

            // Load documents if dataset is selected
            if (nodeData.config?.datasetId) {
                console.log('Loading documents for dataset:', nodeData.config.datasetId);
                loadDocuments(nodeData.config.datasetId);
            }
            // Load segments if document is selected
            if (nodeData.config?.documentId && nodeData.config?.datasetId) {
                console.log('Loading segments for document:', nodeData.config.documentId);
                loadSegments(nodeData.config.datasetId, nodeData.config.documentId);
            }
        }
    }, [isOpen, nodeData?.type, nodeData?.config?.datasetId, nodeData?.config?.documentId, loadDocuments, loadSegments]);

    // Populate dataset search term when popup opens with existing data
    useEffect(() => {
        if (isOpen && nodeData?.type === 'datasource' && nodeData.config?.datasetId) {
            const selectedDataset = datasets.find(d => d.id === nodeData.config.datasetId);
            if (selectedDataset) {
                setDatasetSearchTerm(selectedDataset.name);
            }
        }
    }, [isOpen, nodeData?.type, nodeData?.config?.datasetId, datasets]);

    // Populate document search term when documents are loaded
    useEffect(() => {
        // console.log('🔥 NEW Document population effect triggered at', new Date().toISOString(), {
        //     isOpen,
        //     nodeType: nodeData?.type,
        //     documentId: nodeData?.config?.documentId,
        //     documentsLength: documents.length,
        //     currentDocumentSearchTerm: documentSearchTerm
        // });

        if (isOpen && nodeData?.type === 'datasource' && nodeData.config?.documentId && documents.length > 0 && !isUserTyping) {
            // console.log('Attempting to populate document search term:', {
            //     nodeDataConfig: nodeData.config,
            //     documentsCount: documents.length,
            //     currentSearchTerm: documentSearchTerm
            // });
            const selectedDocument = documents.find(d => d.id === nodeData.config.documentId);
            if (selectedDocument) {
                // console.log('Document found, comparing search terms:', {
                //     current: documentSearchTerm,
                //     expected: selectedDocument.name,
                //     areEqual: documentSearchTerm === selectedDocument.name
                // });
                if (documentSearchTerm !== selectedDocument.name) {
                    // console.log('Setting document search term:', selectedDocument.name);
                    setDocumentSearchTerm(selectedDocument.name);
                } else {
                    // console.log('Document search term already set correctly');
                }
            } else {
                console.log('Document not found in documents array:', {
                    lookingFor: nodeData.config.documentId,
                    available: documents.map(d => d.id)
                });
            }
        }
    }, [isOpen, nodeData?.type, nodeData?.config?.documentId, documents, documentSearchTerm]);

    // Populate segment search term after segments are loaded
    useEffect(() => {
        // console.log('🔥 NEW Segment population effect triggered at', new Date().toISOString(), {
        //     isOpen,
        //     nodeType: nodeData?.type,
        //     segmentId: nodeData?.config?.segmentId,
        //     segmentsLength: segments.length,
        //     currentSegmentSearchTerm: segmentSearchTerm
        // });

        if (isOpen && nodeData?.type === 'datasource' && nodeData.config?.segmentId && segments.length > 0 && !isUserTyping) {
            // console.log('Attempting to populate segment search term:', {
            //     nodeDataConfig: nodeData.config,
            //     segmentsCount: segments.length,
            //     currentSearchTerm: segmentSearchTerm
            // });
            const selectedSegment = segments.find(s => s.id === nodeData.config.segmentId);
            if (selectedSegment) {
                const expectedSearchTerm = selectedSegment.content.substring(0, 50) + '...';
                // console.log('Segment found, comparing search terms:', {
                //     current: segmentSearchTerm,
                //     expected: expectedSearchTerm,
                //     areEqual: segmentSearchTerm === expectedSearchTerm
                // });
                if (segmentSearchTerm !== expectedSearchTerm) {
                    // console.log('Setting segment search term:', expectedSearchTerm);
                    setSegmentSearchTerm(expectedSearchTerm);
                } else {
                    // console.log('Segment search term already set correctly');
                }
            } else {
                console.log('Segment not found in segments array:', {
                    lookingFor: nodeData.config.segmentId,
                    available: segments.map(s => s.id)
                });
            }
        }
    }, [isOpen, nodeData?.type, nodeData?.config?.segmentId, segments, segmentSearchTerm]);

    // Removed alternative population effects to prevent infinite loops

    // Auto-save functionality with debouncing
    const [hasChanges, setHasChanges] = useState(false);
    const initialNodeDataRef = useRef<string | null>(null);

    // Reset changes flag when popup opens
    useEffect(() => {
        if (isOpen && nodeData) {
            initialNodeDataRef.current = JSON.stringify(nodeData);
            setHasChanges(false);
        }
    }, [isOpen]);

    // Track changes to nodeData - removed redundant change detection
    // Changes are now tracked directly in handleNodeDataChange

    // Helper function to handle node data changes
    const handleNodeDataChange = (updates: Partial<WorkflowNode>) => {
        if (nodeData) {
            setNodeData({ ...nodeData, ...updates });
            setHasChanges(true); // Trigger auto-save
        }
    };

    useEffect(() => {
        if (!nodeData || !isOpen || !onAutoSave || !hasChanges) return;

        const timeoutId = setTimeout(() => {
            // Only auto-save if there are no validation errors
            const emptyField = getFirstEmptyRequiredField();
            if (!emptyField) {
                // Use onAutoSave which doesn't close the popup
                onAutoSave(nodeData);
                // Update the reference to the new saved state
                initialNodeDataRef.current = JSON.stringify(nodeData);
                setHasChanges(false);
            }
        }, 1000); // 1 second delay

        return () => clearTimeout(timeoutId);
    }, [nodeData, isOpen, onAutoSave, hasChanges]);

    // Prevent body scroll when popup is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }

        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    // Clear search terms and dropdowns when popup is closed
    useEffect(() => {
        if (!isOpen) {
            console.log('Popup closed, clearing dropdowns');
            setShowDatasetDropdown(false);
            setShowDocumentDropdown(false);
            setShowSegmentDropdown(false);
            setIsUserTyping(false);
            // Clear typing timeout
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
        } else {
            console.log('Popup opened');
        }
    }, [isOpen]);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Element;

            if (showDatasetDropdown && !target.closest('.dataset-dropdown')) {
                setShowDatasetDropdown(false);
            }
            if (showDocumentDropdown && !target.closest('.document-dropdown')) {
                setShowDocumentDropdown(false);
            }
            if (showSegmentDropdown && !target.closest('.segment-dropdown')) {
                setShowSegmentDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showDatasetDropdown, showDocumentDropdown, showSegmentDropdown]);

    // Filter datasets based on search term
    useEffect(() => {
        const searchDatasets = async () => {
            if (!datasetSearchTerm.trim()) {
                setFilteredDatasets(datasets);
            } else {
                try {
                    setIsLoadingDatasets(true);
                    const response = await datasetApi.searchDatasets({
                        q: datasetSearchTerm,
                        limit: 50
                    });
                    setFilteredDatasets(response.data);
                } catch (error) {
                    console.error('Failed to search datasets:', error);
                    // Fallback to local filtering
                    const filtered = datasets.filter(dataset =>
                        dataset.name.toLowerCase().includes(datasetSearchTerm.toLowerCase()) ||
                        dataset.description?.toLowerCase().includes(datasetSearchTerm.toLowerCase())
                    );
                    setFilteredDatasets(filtered);
                } finally {
                    setIsLoadingDatasets(false);
                }
            }
        };

        const timeoutId = setTimeout(searchDatasets, 300); // Debounce search
        return () => clearTimeout(timeoutId);
    }, [datasetSearchTerm, datasets]);

    // Filter documents based on search term
    useEffect(() => {
        if (!documentSearchTerm.trim()) {
            setFilteredDocuments(documents);
        } else {
            const filtered = documents.filter(doc =>
                doc.name.toLowerCase().includes(documentSearchTerm.toLowerCase()) ||
                doc.description?.toLowerCase().includes(documentSearchTerm.toLowerCase())
            );
            setFilteredDocuments(filtered);
        }
    }, [documentSearchTerm, documents]);

    // Filter segments based on search term
    useEffect(() => {
        if (!segmentSearchTerm.trim()) {
            setFilteredSegments(segments);
        } else {
            const filtered = segments.filter(segment =>
                segment.content.toLowerCase().includes(segmentSearchTerm.toLowerCase())
            );
            setFilteredSegments(filtered);
        }
    }, [segmentSearchTerm, segments]);

    const executeTest = async () => {
        if (!nodeData) return;

        setIsTesting(true);
        try {
            // Get previous node output for input mapping
            const previousNode = getPreviousNode(nodeData.id, workflowNodes);
            const previousOutput = previousNode?.testOutput;

            // Apply field mapping to config if previous output exists
            const mappedConfig = { ...nodeData.config };
            if (previousOutput && nodeData.config) {
                // Map fields from previous output to current config
                Object.keys(nodeData.config).forEach(key => {
                    const configValue = nodeData.config[key];
                    // If config value is a field name from previous output, map the actual value
                    const items = previousOutput.items || previousOutput.data || previousOutput.outputSegments;
                    if (typeof configValue === 'string' && items && Array.isArray(items)) {
                        const firstItem = items[0];
                        if (firstItem && firstItem[configValue] !== undefined) {
                            // This is a field mapping, use the actual value from previous output
                            mappedConfig[key] = firstItem[configValue];
                        }
                    }
                });

                // Special handling for Duplicate Segment Detection content field mapping
                if (nodeData.type === 'duplicate_segment' && nodeData.config.contentField) {
                    // The contentField specifies which field to use for content comparison
                    // We'll pass this information to the backend for processing
                    mappedConfig.contentFieldMapping = nodeData.config.contentField;
                }
            }

            // Validate contentField for rule-based filter
            if (nodeData.type === 'rule_based_filter') {
                if (!mappedConfig.contentField) {
                    setValidationError('contentField');
                    setTestOutput(null);
                    return;
                }
            }

            // Call the step test API to get actual data using current node configuration
            const requestBody: any = {
                stepType: nodeData.type,
                config: mappedConfig,
                userId: 'current-user', // This will be overridden by the backend with the actual user ID
                previousOutput: previousOutput, // Pass previous node output for mapping
            };

            // For Duplicate Segment Detection, pass previous output as input segments
            if (nodeData.type === 'duplicate_segment' && previousOutput) {
                if (previousOutput.items) {
                    requestBody.inputSegments = previousOutput.items;
                } else if (previousOutput.outputSegments) {
                    requestBody.inputSegments = previousOutput.outputSegments;
                } else if (previousOutput.data && Array.isArray(previousOutput.data)) {
                    // Handle Lenx API datasource output format 
                    // Pass the complete structure so data.post_message path works
                    requestBody.inputSegments = [previousOutput];
                }
            }

            // For Rule-Based Filter, pass previous output as input segments
            if (nodeData.type === 'rule_based_filter' && previousOutput) {
                if (previousOutput.items) {
                    requestBody.inputSegments = previousOutput.items;
                } else if (previousOutput.outputSegments) {
                    requestBody.inputSegments = previousOutput.outputSegments;
                } else if (previousOutput.data && Array.isArray(previousOutput.data)) {
                    // Handle Lenx API datasource output format 
                    // Pass the complete structure so data.post_message path works
                    requestBody.inputSegments = [previousOutput];
                } else {
                    // Fallback: pass the entire previous output
                    requestBody.inputSegments = [previousOutput];
                }
            }
            const response = await apiClient.post('/workflow/steps/test', requestBody);

            // Transform the complex API response to simplified format
            const simplifiedOutput = transformDataSourceOutput(response.data, nodeData.config);
            const optimizedOutput = optimizeTestOutput(simplifiedOutput);
            setTestOutput(optimizedOutput);

            // Store optimized test output in node data
            const updatedNodeData = {
                ...nodeData,
                testOutput: optimizedOutput
            };
            setNodeData(updatedNodeData);
            // Don't call onSave here as it closes the popup - just update local state
        } catch (error: any) {
            console.error('Test execution failed:', error);
            const errorOutput = {
                error: 'Test execution failed',
                message: error?.response?.data?.message || error?.message || 'Unknown error',
                timestamp: new Date().toISOString(),
            };
            const optimizedErrorOutput = optimizeTestOutput(errorOutput);
            setTestOutput(optimizedErrorOutput);

            // Store optimized error output in node data
            const updatedNodeData = {
                ...nodeData,
                testOutput: optimizedErrorOutput
            };
            setNodeData(updatedNodeData);
            // Don't call onSave here as it closes the popup - just update local state
        } finally {
            setIsTesting(false);
        }
    };

    // Transform complex data source output to simplified format with sample limiting
    const transformDataSourceOutput = (apiResponse: Record<string, any>, nodeConfig?: Record<string, any>) => {
        if (apiResponse.stepType === 'datasource' && apiResponse.outputSegments) {
            const totalCount = apiResponse.outputSegments.length;
            const sampleCount = Math.min(5, totalCount); // Limit to first 5 samples
            const sampleItems = apiResponse.outputSegments.slice(0, sampleCount);

            return {
                items: sampleItems,
                meta: {
                    totalCount,
                    sampleCount,
                    lastUpdated: new Date().toISOString(),
                    limit: nodeConfig?.limit || 10,
                    offset: nodeConfig?.offset || 0,
                    total: apiResponse.metrics?.outputCount || 0,
                    loadedCount: apiResponse.metrics?.loadedCount || 0,
                    hasMoreData: totalCount > sampleCount
                }
            };
        }

        // Special handling for Duplicate Segment Detection
        if (apiResponse.stepType === 'duplicate_segment') {
            // The backend testStep now returns { items, total, duplicates, duplicate_count } directly
            // Check if the response already has the correct structure
            if (apiResponse.items !== undefined && apiResponse.total !== undefined) {
                // Response is already in the correct format, just limit arrays
                const sampleCount = Math.min(10, apiResponse.items.length);
                const sampleDuplicatesCount = Math.min(10, apiResponse.duplicates?.length || 0);

                return {
                    items: apiResponse.items.slice(0, sampleCount),
                    total: apiResponse.total,
                    duplicates: apiResponse.duplicates?.slice(0, sampleDuplicatesCount) || [],
                    duplicate_count: apiResponse.duplicate_count || 0
                };
            }

            // Fallback: Extract from outputSegments if response is wrapped
            const outputData = apiResponse.outputSegments?.[0] || apiResponse;

            const items = outputData.items || apiResponse.outputSegments || [];
            const total = outputData.total !== undefined ? outputData.total : items.length;
            const duplicates = outputData.duplicates || [];
            const duplicate_count = outputData.duplicate_count !== undefined
                ? outputData.duplicate_count
                : (apiResponse.metrics?.duplicatesFound || duplicates.length);

            // Limit samples to prevent payload too large
            const sampleCount = Math.min(10, items.length);
            const sampleDuplicatesCount = Math.min(10, duplicates.length);

            return {
                items: items.slice(0, sampleCount),
                total: total,
                duplicates: duplicates.slice(0, sampleDuplicatesCount),
                duplicate_count: duplicate_count
            };
        }

        // For other nodes, return the original response
        return apiResponse;
    };

    // Optimize test output to prevent payload too large errors
    const optimizeTestOutput = (output: Record<string, any>): Record<string, any> => {
        if (!output || typeof output !== 'object') {
            return output;
        }

        // Special handling ONLY for duplicate_segment format - must have duplicate_count field
        // This ensures we don't accidentally match other nodes with items/total fields
        if (output.items !== undefined &&
            output.total !== undefined &&
            output.duplicates !== undefined &&
            output.duplicate_count !== undefined) {
            // Duplicate segment format - keep it clean, just limit arrays
            const items = Array.isArray(output.items) ? output.items.slice(0, 10) : output.items;
            const duplicates = Array.isArray(output.duplicates) ? output.duplicates.slice(0, 10) : output.duplicates;

            return {
                items,
                total: output.total,
                duplicates,
                duplicate_count: output.duplicate_count || 0
            };
        }

        // If output has items array (generic case), limit to 10 samples and preserve all other fields
        if (output.items && Array.isArray(output.items)) {
            const totalCount = output.items.length;
            const sampleCount = Math.min(10, totalCount);
            const sampleItems = output.items.slice(0, sampleCount);

            return {
                ...output,  // Preserve ALL other fields (meta, etc.)
                items: sampleItems,
                ...(output.meta ? {
                    meta: {
                        ...output.meta,
                        totalCount,
                        sampleCount,
                        hasMoreData: totalCount > sampleCount
                    }
                } : {
                    meta: {
                        totalCount,
                        sampleCount,
                        lastUpdated: new Date().toISOString(),
                        hasMoreData: totalCount > sampleCount
                    }
                })
            };
        }

        // For other output formats, keep as is but add metadata if it doesn't exist
        if (!output.meta) {
            return {
                ...output,
                meta: {
                    lastUpdated: new Date().toISOString(),
                    sampleCount: 1,
                    totalCount: 1
                }
            };
        }

        return output;
    };


    if (!isOpen) return null;

    const stepInfo = availableSteps.find(s => s.type === nodeData?.type);
    const isTriggerNode = nodeData?.type.startsWith('trigger_') || false;
    const isDataSourceNode = nodeData?.type === 'datasource';

    // Function to find the first empty required field
    const getFirstEmptyRequiredField = () => {
        if (!nodeData || !stepInfo?.configSchema?.properties) return null;

        const requiredFields = stepInfo.configSchema.required || [];
        const config = nodeData.config || {};

        // Find the first empty required field
        for (const field of requiredFields) {
            const value = config[field];

            // Check for empty values based on type
            if (value === undefined || value === null) {
                return field;
            }

            // String fields
            if (typeof value === 'string' && value.trim() === '') {
                return field;
            }

            // Array fields
            if (Array.isArray(value) && value.length === 0) {
                return field;
            }

            // Object fields - special handling for hashConfig
            if (typeof value === 'object' && !Array.isArray(value)) {
                if (Object.keys(value).length === 0) {
                    return field;
                }
                // For hashConfig, check if fields array is empty
                if (field === 'hashConfig' && (!value.fields || !Array.isArray(value.fields) || value.fields.length === 0)) {
                    return field;
                }
            }
        }

        return null; // All required fields are filled
    };

    // Function to focus on the first empty required field and show validation error
    const focusFirstEmptyField = () => {
        const emptyField = getFirstEmptyRequiredField();
        if (emptyField) {
            // Set validation error state
            setValidationError(emptyField);

            // Find the input element for this field
            const inputElement = document.querySelector(`input[name="${emptyField}"], textarea[name="${emptyField}"], select[name="${emptyField}"]`) as HTMLElement;
            if (inputElement) {
                inputElement.focus();
                inputElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else {
            // Clear validation error if all fields are filled
            setValidationError(null);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
        >
            {/* Backdrop - doesn't close on click */}
            <div
                className="absolute inset-0 bg-black/50"
                onClick={(e) => e.stopPropagation()}
            />

            {/* Dialog Content */}
            <div
                ref={dialogRef}
                className="relative bg-white rounded-lg shadow-lg w-[calc(100vw-2rem)] h-[calc(100vh-2rem)] max-w-none flex flex-col overflow-hidden"
                onWheel={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 border-b">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-blue-100">
                                {isTriggerNode && <Zap className="h-5 w-5 text-blue-600" />}
                                {isDataSourceNode && <Database className="h-5 w-5 text-green-600" />}
                                {!isTriggerNode && !isDataSourceNode && <Settings className="h-5 w-5 text-gray-600" />}
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold">
                                    <Input
                                        value={nodeData?.name || ''}
                                        onChange={(e) => handleNodeDataChange({ name: e.target.value })}
                                        className="text-lg font-semibold border-none p-0 h-auto"
                                        onBlur={() => {
                                            // Auto-save is handled by useEffect
                                        }}
                                    />
                                </h2>
                                <p className="text-sm text-gray-600">
                                    {stepInfo?.description}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                onClick={() => {
                                    const emptyField = getFirstEmptyRequiredField();
                                    if (emptyField) {
                                        focusFirstEmptyField();
                                    } else {
                                        executeTest();
                                    }
                                }}
                                disabled={isTesting}
                                className="bg-blue-600 hover:bg-blue-700"
                            >
                                {isTesting ? (
                                    <>
                                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                                        Testing...
                                    </>
                                ) : (
                                    <>
                                        <Play className="h-3 w-3 mr-2" />
                                        Test Step
                                    </>
                                )}
                            </Button>
                            {onDelete && (
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => {
                                        if (nodeData?.id) {
                                            onDelete(nodeData.id);
                                            onClose(nodeData);
                                        }
                                    }}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    // Auto-save is handled by useEffect, just close
                                    onClose(nodeData || undefined);
                                }}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 flex overflow-hidden min-h-0">
                    {/* Left Column - Inputs */}
                    <div className="w-1/3 border-r bg-gray-50 p-4">
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-sm font-medium text-gray-700 mb-3">Inputs</h3>
                                {isTriggerNode ? (
                                    <div className="space-y-2">
                                        <div className="p-3 bg-blue-50 rounded-lg">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Zap className="h-4 w-4 text-blue-600" />
                                                <span className="text-sm font-medium">Trigger</span>
                                            </div>
                                            <p className="text-xs text-gray-600">
                                                {nodeData?.type === 'trigger_manual' ? 'Manual trigger - starts workflow execution' : 'Scheduled trigger - runs on schedule'}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {getPreviousNode(nodeData?.id || '', workflowNodes) ? (
                                            <div className="space-y-3">
                                                <div className="p-3 bg-gray-50 rounded-lg">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <ArrowLeft className="h-4 w-4 text-gray-600" />
                                                        <span className="text-sm font-medium">Previous Step</span>
                                                    </div>
                                                    <p className="text-xs text-gray-600">
                                                        {getPreviousNode(nodeData?.id || '', workflowNodes)?.name} → {nodeData?.name}
                                                    </p>
                                                </div>

                                                {/* Show previous node test output for Duplicate Segment Detection */}
                                                {nodeData?.type === 'duplicate_segment' && (
                                                    getPreviousNode(nodeData?.id || '', workflowNodes)?.testOutput ? (
                                                        <div className="p-3 bg-green-50 rounded-lg flex flex-col max-h-96">
                                                            <div className="flex items-center gap-2 mb-2 flex-shrink-0">
                                                                <Database className="h-4 w-4 text-green-600" />
                                                                <span className="text-sm font-medium">Previous Output</span>
                                                            </div>
                                                            <JsonViewer
                                                                data={getPreviousNode(nodeData?.id || '', workflowNodes)?.testOutput}
                                                                maxHeight="max-h-80"
                                                                maxLevel={2}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="p-3 bg-amber-50 rounded-lg">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <Database className="h-4 w-4 text-amber-600" />
                                                                <span className="text-sm font-medium">No Previous Output</span>
                                                            </div>
                                                            <p className="text-xs text-amber-700">
                                                                Run the previous step first to see available fields for content mapping
                                                            </p>
                                                        </div>
                                                    )
                                                )}

                                                {/* Show previous node test output for Post Upserter */}
                                                {nodeData?.type === 'post_upserter' && (
                                                    getPreviousNode(nodeData?.id || '', workflowNodes)?.testOutput ? (
                                                        <div className="p-3 bg-green-50 rounded-lg flex flex-col max-h-96">
                                                            <div className="flex items-center gap-2 mb-2 flex-shrink-0">
                                                                <Database className="h-4 w-4 text-green-600" />
                                                                <span className="text-sm font-medium">Input Data</span>
                                                            </div>
                                                            <p className="text-xs text-gray-600 mb-2">
                                                                Preview of data that will be processed by Post Upserter. Use this to configure field mappings.
                                                            </p>
                                                            <JsonViewer
                                                                data={getPreviousNode(nodeData?.id || '', workflowNodes)?.testOutput}
                                                                maxHeight="max-h-80"
                                                                maxLevel={2}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="p-3 bg-amber-50 rounded-lg">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <Database className="h-4 w-4 text-amber-600" />
                                                                <span className="text-sm font-medium">No Input Data</span>
                                                            </div>
                                                            <p className="text-xs text-amber-700">
                                                                Run the previous step first to see available fields for field mappings
                                                            </p>
                                                        </div>
                                                    )
                                                )}

                                                {/* Show previous node test output for Post Deleter */}
                                                {nodeData?.type === 'post_deleter' && (
                                                    getPreviousNode(nodeData?.id || '', workflowNodes)?.testOutput ? (
                                                        <div className="p-3 bg-green-50 rounded-lg flex flex-col max-h-96">
                                                            <div className="flex items-center gap-2 mb-2 flex-shrink-0">
                                                                <Database className="h-4 w-4 text-green-600" />
                                                                <span className="text-sm font-medium">Input Data</span>
                                                            </div>
                                                            <p className="text-xs text-gray-600 mb-2">
                                                                Preview of data that will be processed by Post Deleter. Use this to select the ID field for deletion.
                                                            </p>
                                                            <JsonViewer
                                                                data={getPreviousNode(nodeData?.id || '', workflowNodes)?.testOutput}
                                                                maxHeight="max-h-80"
                                                                maxLevel={2}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="p-3 bg-amber-50 rounded-lg">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <Database className="h-4 w-4 text-amber-600" />
                                                                <span className="text-sm font-medium">No Input Data</span>
                                                            </div>
                                                            <p className="text-xs text-amber-700">
                                                                Run the previous step first to see available fields for ID field mapping
                                                            </p>
                                                        </div>
                                                    )
                                                )}

                                                {/* Show previous node test output for Rule-Based Filter */}
                                                {nodeData?.type === 'rule_based_filter' && (
                                                    getPreviousNode(nodeData?.id || '', workflowNodes)?.testOutput ? (
                                                        <div className="p-3 bg-green-50 rounded-lg flex flex-col max-h-96">
                                                            <div className="flex items-center gap-2 mb-2 flex-shrink-0">
                                                                <Database className="h-4 w-4 text-green-600" />
                                                                <span className="text-sm font-medium">Input Data</span>
                                                            </div>
                                                            <p className="text-xs text-gray-600 mb-2">
                                                                Preview of data that will be processed by Rule-Based Filter. Use this to select the content field for filtering.
                                                            </p>
                                                            <JsonViewer
                                                                data={getPreviousNode(nodeData?.id || '', workflowNodes)?.testOutput}
                                                                maxHeight="max-h-80"
                                                                maxLevel={2}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="p-3 bg-amber-50 rounded-lg">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <Database className="h-4 w-4 text-amber-600" />
                                                                <span className="text-sm font-medium">No Input Data</span>
                                                            </div>
                                                            <p className="text-xs text-amber-700">
                                                                Run the previous step first to see available fields for content field selection
                                                            </p>
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        ) : (
                                            <div className="p-3 bg-gray-50 rounded-lg">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <ArrowLeft className="h-4 w-4 text-gray-600" />
                                                    <span className="text-sm font-medium">No Previous Step</span>
                                                </div>
                                                <p className="text-xs text-gray-600">This is the first step in the workflow</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Middle Column - Configuration */}
                    <div className="w-1/3 border-r p-4 flex flex-col min-h-0">
                        <h3 className="text-sm font-medium text-gray-700 mb-3 flex-shrink-0">Configuration</h3>
                        <Tabs defaultValue="config" className="flex-1 flex flex-col min-h-0">
                            <TabsList className="grid w-full grid-cols-2 flex-shrink-0">
                                <TabsTrigger value="config">Settings</TabsTrigger>
                                <TabsTrigger value="advanced">Advanced</TabsTrigger>
                            </TabsList>

                            <TabsContent value="config" className="space-y-4 mt-4 flex-1 overflow-y-auto min-h-0">
                                {renderNodeConfiguration()}
                            </TabsContent>

                            <TabsContent value="advanced" className="space-y-4 mt-4 flex-1 overflow-y-auto min-h-0">
                                {renderAdvancedConfiguration()}
                            </TabsContent>
                        </Tabs>
                    </div>

                    {/* Right Column - Outputs */}
                    <div className="w-1/3 bg-gray-50 p-4 flex flex-col min-h-0">
                        <h3 className="text-sm font-medium text-gray-700 mb-3 flex-shrink-0">Outputs</h3>
                        <Card className="flex-1 flex flex-col min-h-0">
                            <CardContent className="p-3 flex-1 flex flex-col min-h-0">
                                <div className="flex items-center justify-between mb-3 flex-shrink-0">
                                    {testOutput && (
                                        <div className="flex items-center gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setTestOutput(null)}
                                                className="text-gray-600 hover:text-gray-800"
                                                title="Clear output"
                                            >
                                                <X className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1 flex flex-col min-h-0">
                                    {testOutput ? (
                                        <div className="flex-1 flex flex-col min-h-0">
                                            <JsonViewer
                                                data={testOutput}
                                                maxHeight="h-full"
                                                maxLevel={3}
                                            />
                                        </div>
                                    ) : (
                                        <div className="bg-gray-100 text-gray-500 p-4 rounded text-center flex-1 flex flex-col items-center justify-center">
                                            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                            <p className="text-sm">No test results yet</p>
                                            <p className="text-xs mt-1">Click the Test Step button to execute this step</p>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );

    function renderNodeConfiguration() {
        if (!nodeData) return null;

        // Special handling for Rule-Based Filter node - render rules configuration
        if (nodeData.type === 'rule_based_filter') {
            const filterConfig = {
                rules: nodeData.config?.rules || [],
                defaultAction: nodeData.config?.defaultAction || 'keep',
                caseSensitive: nodeData.config?.caseSensitive || false,
                wholeWord: nodeData.config?.wholeWord || false,
                minContentLength: nodeData.config?.minContentLength,
                maxContentLength: nodeData.config?.maxContentLength,
                preserveEmptySegments: nodeData.config?.preserveEmptySegments || false
            };

            return (
                <div className="space-y-4">
                    {/* Render contentField from enhanced schema first */}
                    {(() => {
                        const previousOutputFields = getPreviousOutputFields();
                        if (previousOutputFields.length > 0 && nodeData.config) {
                            const contentFieldSchema = {
                                type: 'string',
                                title: 'Content Field',
                                description: 'Field from previous output to use for content filtering',
                                mappingField: true
                            };
                            return (
                                <div className="space-y-2">
                                    <Label htmlFor="contentField" className="text-sm font-medium">
                                        Content Field
                                        <span className="text-red-500 ml-1">*</span>
                                    </Label>
                                    <Select
                                        name="contentField"
                                        value={nodeData.config?.contentField || ''}
                                        onValueChange={(val) => updateConfig('contentField', val)}
                                    >
                                        <SelectTrigger className={validationError === 'contentField' ? 'border-red-500 focus:border-red-500' : ''}>
                                            <SelectValue placeholder="Select content field from previous output" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {previousOutputFields.map((field) => {
                                                const fieldValue = getPreviousOutputFieldValue(field);
                                                const preview = fieldValue ?
                                                    (typeof fieldValue === 'string' ?
                                                        fieldValue.substring(0, 50) + (fieldValue.length > 50 ? '...' : '') :
                                                        JSON.stringify(fieldValue).substring(0, 50) + '...') :
                                                    'No preview available';
                                                return (
                                                    <SelectItem key={field} value={field}>
                                                        <div className="flex flex-col">
                                                            <span className="font-medium">{field}</span>
                                                            <span className="text-xs text-gray-500">{preview}</span>
                                                        </div>
                                                    </SelectItem>
                                                );
                                            })}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-gray-500">
                                        Select which field from the previous output contains the content to filter.
                                        <br />
                                        <strong>Note:</strong> Do not include wrapper fields like "data" or "items". Only select fields that exist in each item (e.g., "post_message", not "data.post_message").
                                    </p>
                                    {validationError === 'contentField' && (
                                        <p className="text-sm text-red-500">Content Field is required</p>
                                    )}
                                </div>
                            );
                        }
                        return null;
                    })()}

                    {/* Render rules configuration */}
                    <RuleBasedFilterConfig
                        config={filterConfig}
                        onChange={(newConfig) => {
                            handleNodeDataChange({
                                config: {
                                    ...nodeData.config,
                                    ...newConfig,
                                    // Preserve contentField if it exists
                                    contentField: nodeData.config?.contentField
                                }
                            });
                        }}
                        onValidate={(isValid, errors) => {
                            if (!isValid && errors.length > 0) {
                                setValidationError('rule_config');
                            } else {
                                setValidationError(null);
                            }
                        }}
                    />
                </div>
            );
        }

        const stepInfo = availableSteps.find(s => s.type === nodeData?.type);
        if (!stepInfo?.configSchema) {
            return (
                <div className="text-center py-8 text-gray-500">
                    <Settings className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No configurable settings for this step</p>
                </div>
            );
        }

        // Add content field mapping for Duplicate Segment Detection and Rule-Based Filter if there's previous output
        const enhancedSchema = { ...stepInfo.configSchema };
        const previousOutputFields = getPreviousOutputFields();

        if (nodeData.type === 'duplicate_segment' && previousOutputFields.length > 0) {
            enhancedSchema.properties = {
                ...enhancedSchema.properties,
                contentField: {
                    type: 'string',
                    title: 'Content Field',
                    description: 'Field from previous output to use for content comparison',
                    mappingField: true
                }
            };
        }

        if (nodeData.type === 'rule_based_filter' && previousOutputFields.length > 0) {
            enhancedSchema.properties = {
                ...enhancedSchema.properties,
                contentField: {
                    type: 'string',
                    title: 'Content Field',
                    description: 'Field from previous output to use for content filtering',
                    mappingField: true
                }
            };
            // Make contentField required for rule-based filter
            if (!enhancedSchema.required) {
                enhancedSchema.required = [];
            }
            if (!enhancedSchema.required.includes('contentField')) {
                enhancedSchema.required.push('contentField');
            }
        }

        return (
            <div className="space-y-4">
                {Object.entries(enhancedSchema.properties || {}).map(([key, schema]: [string, any]) => {
                    // Conditional rendering for Duplicate Segment Detection
                    if (nodeData?.type === 'duplicate_segment') {
                        const method = nodeData.config?.method;

                        // Show similarity threshold only for similarity method
                        if (key === 'similarityThreshold' && method !== 'similarity') {
                            return null;
                        }

                        // Show content field only for similarity method
                        if (key === 'contentField' && method !== 'similarity') {
                            return null;
                        }

                        // Show hash-specific fields only for hash method
                        if ((key === 'caseSensitive' || key === 'normalizeText' || key === 'ignoreWhitespace') && method !== 'hash') {
                            return null;
                        }
                    }

                    // Conditional rendering for Post Upserter
                    if (nodeData?.type === 'post_upserter') {
                        // Hide deduplicationStrategy and deduplicationFields - always use hash strategy
                        if (key === 'deduplicationStrategy' || key === 'deduplicationFields') {
                            return null;
                        }
                    }

                    // Conditional rendering for Lenx API Data Source based on dateMode
                    if (nodeData?.type === 'lenx_api_datasource') {
                        const dateMode = nodeData.config?.dateMode;

                        // For fixed mode: show startDate, endDate, dateIntervalMinutes
                        // For dynamic mode: show intervalMinutes
                        if (dateMode === 'fixed') {
                            // Hide dynamic mode fields
                            if (key === 'intervalMinutes') {
                                return null;
                            }
                        } else if (dateMode === 'dynamic') {
                            // Hide fixed mode fields
                            if (key === 'startDate' || key === 'endDate' || key === 'dateIntervalMinutes') {
                                return null;
                            }
                        } else {
                            // If dateMode is not set yet, hide both sets of fields
                            if (key === 'startDate' || key === 'endDate' || key === 'dateIntervalMinutes' || key === 'intervalMinutes') {
                                return null;
                            }
                        }
                    }

                    // Special rendering for Post Upserter nested objects
                    if (nodeData?.type === 'post_upserter') {
                        if (key === 'fieldMappings') {
                            return renderFieldMappingsConfig(key, schema);
                        }
                        if (key === 'hashConfig') {
                            return renderHashConfig(key, schema);
                        }
                        if (key === 'defaults') {
                            return renderDefaultsConfig(key, schema);
                        }
                    }

                    // Special rendering for Post Deleter nested objects
                    if (nodeData?.type === 'post_deleter') {
                        if (key === 'fieldMappings') {
                            return renderPostDeleterFieldMappingsConfig(key, schema);
                        }
                    }

                    // Special handling for Post Data Source - only show postedAtStart and postedAtEnd by default
                    if (nodeData?.type === 'post_datasource') {
                        // Hide userId field
                        if (key === 'userId') {
                            return null;
                        }

                        // Only show postedAtStart and postedAtEnd by default
                        // Other fields are in advanced section
                        const advancedFields = ['hash', 'provider', 'source', 'title', 'metaKey', 'metaValue', 'startDate', 'endDate', 'page', 'limit'];
                        const isAdvancedField = advancedFields.includes(key);
                        const isAdvancedOpen = nodeData.config?._advancedOpen || false;

                        // Render advanced section header before the first advanced field (when closed)
                        if (isAdvancedField && key === 'hash' && !isAdvancedOpen) {
                            return (
                                <div key="advanced-options-header" className="border-t pt-4 mt-4">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            handleNodeDataChange({
                                                config: {
                                                    ...nodeData.config,
                                                    _advancedOpen: true,
                                                },
                                            });
                                        }}
                                        className="w-full justify-between p-0 h-auto"
                                    >
                                        <span className="text-xs font-medium text-gray-700">Advanced Options</span>
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            );
                        }

                        // Render advanced section header with collapse button (when open) before first advanced field
                        // When section is open, render header and the hash field together
                        if (isAdvancedField && key === 'hash' && isAdvancedOpen) {
                            return (
                                <div key="advanced-options-section" className="space-y-2">
                                    <div className="border-t pt-4 mt-4">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                handleNodeDataChange({
                                                    config: {
                                                        ...nodeData.config,
                                                        _advancedOpen: false,
                                                    },
                                                });
                                            }}
                                            className="w-full justify-between p-0 h-auto"
                                        >
                                            <span className="text-xs font-medium text-gray-700">Advanced Options</span>
                                            <ChevronDown className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor={key} className="text-sm font-medium">
                                            {schema.title || key}
                                            {enhancedSchema.required?.includes(key) && (
                                                <span className="text-red-500 ml-1">*</span>
                                            )}
                                        </Label>
                                        {schema.description && (
                                            <p className="text-xs text-gray-500">{schema.description}</p>
                                        )}
                                        <div className="mt-2">
                                            {renderConfigField(key, schema)}
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        if (isAdvancedField && !isAdvancedOpen) {
                            // Don't render advanced fields when section is closed
                            return null;
                        }
                    }

                    return (
                        <div key={key} className="space-y-2">
                            <Label htmlFor={key} className="text-sm font-medium">
                                {schema.title || key}
                                {enhancedSchema.required?.includes(key) && (
                                    <span className="text-red-500 ml-1">*</span>
                                )}
                            </Label>
                            {schema.description && (
                                <p className="text-xs text-gray-500">{schema.description}</p>
                            )}
                            <div className="mt-2">
                                {renderConfigField(key, schema)}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    function renderConfigField(key: string, schema: Record<string, any>) {
        if (!nodeData) return null;
        const value = nodeData.config?.[key] ?? schema.default;
        const hasError = validationError === key;
        const errorMessage = hasError ? `${schema.title || key} is required` : '';
        const previousOutputFields = getPreviousOutputFields();
        const isMappingField = schema.mappingField === true;

        switch (schema.type) {
            case 'string':
                if (schema.enum) {
                    return (
                        <div className="space-y-1">
                            <Select
                                name={key}
                                value={value || ''}
                                onValueChange={(val) => updateConfig(key, val)}
                            >
                                <SelectTrigger className={hasError ? 'border-red-500 focus:border-red-500' : ''}>
                                    <SelectValue placeholder={`Select ${key}`} />
                                </SelectTrigger>
                                <SelectContent>
                                    {schema.enum.map((option: string) => (
                                        <SelectItem key={option} value={option}>
                                            {option}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {hasError && (
                                <p className="text-sm text-red-500">{errorMessage}</p>
                            )}
                        </div>
                    );
                }

                // Special handling for Duplicate Segment Detection content field mapping
                if (nodeData?.type === 'duplicate_segment' && key === 'contentField' && previousOutputFields.length > 0) {
                    return (
                        <div className="space-y-1">
                            <Select
                                name={key}
                                value={value || ''}
                                onValueChange={(val) => updateConfig(key, val)}
                            >
                                <SelectTrigger className={hasError ? 'border-red-500 focus:border-red-500' : ''}>
                                    <SelectValue placeholder="Select content field from previous output" />
                                </SelectTrigger>
                                <SelectContent>
                                    {previousOutputFields.map((field) => {
                                        const fieldValue = getPreviousOutputFieldValue(field);
                                        const preview = fieldValue ?
                                            (typeof fieldValue === 'string' ?
                                                fieldValue.substring(0, 50) + (fieldValue.length > 50 ? '...' : '') :
                                                JSON.stringify(fieldValue).substring(0, 50) + '...') :
                                            'No preview available';
                                        return (
                                            <SelectItem key={field} value={field}>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{field}</span>
                                                    <span className="text-xs text-gray-500">{preview}</span>
                                                </div>
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500">
                                Select which field from the previous output contains the content to compare for duplicates.
                                <br />
                                <strong>Note:</strong> Do not include wrapper fields like "data". Only select fields that exist in each item (e.g., "post_message", not "data.post_message").
                            </p>
                            {hasError && (
                                <p className="text-sm text-red-500">{errorMessage}</p>
                            )}
                        </div>
                    );
                }

                // Special handling for Rule-Based Filter content field mapping
                if (nodeData?.type === 'rule_based_filter' && key === 'contentField' && previousOutputFields.length > 0) {
                    return (
                        <div className="space-y-1">
                            <Select
                                name={key}
                                value={value || ''}
                                onValueChange={(val) => updateConfig(key, val)}
                            >
                                <SelectTrigger className={hasError ? 'border-red-500 focus:border-red-500' : ''}>
                                    <SelectValue placeholder="Select content field from previous output" />
                                </SelectTrigger>
                                <SelectContent>
                                    {previousOutputFields.map((field) => {
                                        const fieldValue = getPreviousOutputFieldValue(field);
                                        const preview = fieldValue ?
                                            (typeof fieldValue === 'string' ?
                                                fieldValue.substring(0, 50) + (fieldValue.length > 50 ? '...' : '') :
                                                JSON.stringify(fieldValue).substring(0, 50) + '...') :
                                            'No preview available';
                                        return (
                                            <SelectItem key={field} value={field}>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{field}</span>
                                                    <span className="text-xs text-gray-500">{preview}</span>
                                                </div>
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500">
                                Select which field from the previous output contains the content to filter.
                                <br />
                                <strong>Note:</strong> Do not include wrapper fields like "data" or "items". Only select fields that exist in each item (e.g., "post_message", not "data.post_message").
                            </p>
                            {hasError && (
                                <p className="text-sm text-red-500">{errorMessage}</p>
                            )}
                        </div>
                    );
                }

                // Special handling for mapping fields (e.g., content field mapping for other nodes)
                if (isMappingField && previousOutputFields.length > 0) {
                    return (
                        <div className="space-y-1">
                            <Select
                                name={key}
                                value={value || ''}
                                onValueChange={(val) => updateConfig(key, val)}
                            >
                                <SelectTrigger className={hasError ? 'border-red-500 focus:border-red-500' : ''}>
                                    <SelectValue placeholder={`Select field from previous output`} />
                                </SelectTrigger>
                                <SelectContent>
                                    {previousOutputFields.map((field) => {
                                        const fieldValue = getPreviousOutputFieldValue(field);
                                        const preview = fieldValue ?
                                            (typeof fieldValue === 'string' ?
                                                fieldValue.substring(0, 50) + (fieldValue.length > 50 ? '...' : '') :
                                                JSON.stringify(fieldValue).substring(0, 50) + '...') :
                                            'No preview available';
                                        return (
                                            <SelectItem key={field} value={field}>
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{field}</span>
                                                    <span className="text-xs text-gray-500">{preview}</span>
                                                </div>
                                            </SelectItem>
                                        );
                                    })}
                                </SelectContent>
                            </Select>
                            {previousOutputFields.length === 0 && (
                                <p className="text-xs text-amber-600">
                                    No previous node output available for mapping. Run the previous step first.
                                </p>
                            )}
                            {hasError && (
                                <p className="text-sm text-red-500">{errorMessage}</p>
                            )}
                        </div>
                    );
                }

                // Special handling for Data Source node fields
                if (nodeData.type === 'datasource') {
                    if (key === 'datasetId') {
                        return (
                            <div className="space-y-1">
                                <div className="relative dataset-dropdown">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <Input
                                            name={key}
                                            value={datasetSearchTerm}
                                            onChange={(e) => {
                                                setDatasetSearchTerm(e.target.value);
                                                setShowDatasetDropdown(true);
                                            }}
                                            onFocus={() => setShowDatasetDropdown(true)}
                                            placeholder="Search datasets..."
                                            className={`pl-10 ${hasError ? 'border-red-500 focus:border-red-500' : ''}`}
                                        />
                                    </div>
                                    {showDatasetDropdown && (
                                        <div
                                            className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {isLoadingDatasets ? (
                                                <div className="p-3 text-center text-gray-500 text-sm">
                                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mx-auto mb-2"></div>
                                                    Loading datasets...
                                                </div>
                                            ) : filteredDatasets.length > 0 ? (
                                                filteredDatasets.map((dataset) => (
                                                    <div
                                                        key={dataset.id}
                                                        className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                                                        onClick={() => {
                                                            updateConfig(key, dataset.id);
                                                            setDatasetSearchTerm(dataset.name);
                                                            setShowDatasetDropdown(false);
                                                        }}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <Database className="h-4 w-4 text-green-600" />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium">{dataset.name}</p>
                                                                <p className="text-xs text-gray-500">{dataset.description || 'No description'}</p>
                                                                <p className="text-xs text-gray-400">
                                                                    Documents • Created {new Date(dataset.createdAt).toLocaleDateString()}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="p-3 text-center text-gray-500 text-sm">
                                                    {datasetSearchTerm ? 'No datasets found matching your search' : 'No datasets available'}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {hasError && (
                                    <p className="text-sm text-red-500">{errorMessage}</p>
                                )}
                            </div>
                        );
                    }

                    if (key === 'documentId' && nodeData.config?.datasetId) {
                        return (
                            <div className="space-y-1">
                                <div className="relative document-dropdown">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <Input
                                            name={key}
                                            value={documentSearchTerm}
                                            onFocus={() => {
                                                console.log('Document input focused, current value:', documentSearchTerm);
                                                setShowDocumentDropdown(true);
                                            }}
                                            onChange={(e) => {
                                                // console.log('Document search term input changed:', e.target.value);
                                                setIsUserTyping(true);
                                                setDocumentSearchTerm(e.target.value);
                                                setShowDocumentDropdown(true);

                                                // Clear existing timeout
                                                if (typingTimeoutRef.current) {
                                                    clearTimeout(typingTimeoutRef.current);
                                                }

                                                // Set new timeout to reset typing flag
                                                typingTimeoutRef.current = setTimeout(() => {
                                                    setIsUserTyping(false);
                                                }, 1000);
                                            }}
                                            placeholder="Search documents... (optional)"
                                            className={`pl-10 ${hasError ? 'border-red-500 focus:border-red-500' : ''}`}
                                        />
                                    </div>
                                    {showDocumentDropdown && (
                                        <div
                                            className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {isLoadingDocuments ? (
                                                <div className="p-3 text-center text-gray-500 text-sm">
                                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mx-auto mb-2"></div>
                                                    Loading documents...
                                                </div>
                                            ) : filteredDocuments.length > 0 ? (
                                                filteredDocuments.map((document) => (
                                                    <div
                                                        key={document.id}
                                                        className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                                                        onClick={() => {
                                                            updateConfig(key, document.id);
                                                            setDocumentSearchTerm(document.name);
                                                            setShowDocumentDropdown(false);
                                                        }}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <FileText className="h-4 w-4 text-blue-600" />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium">{document.name}</p>
                                                                <p className="text-xs text-gray-500">{document.description || 'No description'}</p>
                                                                <p className="text-xs text-gray-400">
                                                                    Status: {document.status} • Created {new Date(document.createdAt).toLocaleDateString()}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="p-3 text-center text-gray-500 text-sm">
                                                    {documentSearchTerm ? 'No documents found matching your search' : 'No documents available'}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500">
                                    Optional: Select a specific document to filter segments
                                </p>
                                {hasError && (
                                    <p className="text-sm text-red-500">{errorMessage}</p>
                                )}
                            </div>
                        );
                    }

                    if (key === 'segmentId' && nodeData.config?.documentId) {
                        return (
                            <div className="space-y-1">
                                <div className="relative segment-dropdown">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                                        <Input
                                            name={key}
                                            value={segmentSearchTerm}
                                            onFocus={() => {
                                                console.log('Segment input focused, current value:', segmentSearchTerm);
                                                setShowSegmentDropdown(true);
                                            }}
                                            onChange={(e) => {
                                                // console.log('Segment search term input changed:', e.target.value);
                                                setIsUserTyping(true);
                                                setSegmentSearchTerm(e.target.value);
                                                setShowSegmentDropdown(true);

                                                // Clear existing timeout
                                                if (typingTimeoutRef.current) {
                                                    clearTimeout(typingTimeoutRef.current);
                                                }

                                                // Set new timeout to reset typing flag
                                                typingTimeoutRef.current = setTimeout(() => {
                                                    setIsUserTyping(false);
                                                }, 1000);
                                            }}
                                            placeholder="Search segments... (optional)"
                                            className={`pl-10 ${hasError ? 'border-red-500 focus:border-red-500' : ''}`}
                                        />
                                    </div>
                                    {showSegmentDropdown && (
                                        <div
                                            className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {isLoadingSegments ? (
                                                <div className="p-3 text-center text-gray-500 text-sm">
                                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mx-auto mb-2"></div>
                                                    Loading segments...
                                                </div>
                                            ) : filteredSegments.length > 0 ? (
                                                filteredSegments.map((segment) => (
                                                    <div
                                                        key={segment.id}
                                                        className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                                                        onClick={() => {
                                                            updateConfig(key, segment.id);
                                                            setSegmentSearchTerm(segment.content.substring(0, 50) + '...');
                                                            setShowSegmentDropdown(false);
                                                        }}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <FileText className="h-4 w-4 text-purple-600" />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium">{segment.content.substring(0, 50)}...</p>
                                                                <p className="text-xs text-gray-500">
                                                                    {segment.wordCount} words • {segment.tokens} tokens
                                                                </p>
                                                                <p className="text-xs text-gray-400">
                                                                    Status: {segment.status} • Created {new Date(segment.createdAt).toLocaleDateString()}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="p-3 text-center text-gray-500 text-sm">
                                                    {segmentSearchTerm ? 'No segments found matching your search' : 'No segments available'}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500">
                                    Optional: Select a specific segment to load only that segment
                                </p>
                                {hasError && (
                                    <p className="text-sm text-red-500">{errorMessage}</p>
                                )}
                            </div>
                        );
                    }
                }

                // Special handling for date-time fields in Lenx API Data Source
                if (nodeData?.type === 'lenx_api_datasource' && (key === 'startDate' || key === 'endDate') && schema.format === 'date-time') {
                    // Convert ISO 8601 to datetime-local format (YYYY-MM-DDTHH:mm)
                    const convertToLocalDateTime = (isoString: string | undefined): string => {
                        if (!isoString) return '';
                        try {
                            const date = new Date(isoString);
                            // Format as YYYY-MM-DDTHH:mm (datetime-local format)
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            const hours = String(date.getHours()).padStart(2, '0');
                            const minutes = String(date.getMinutes()).padStart(2, '0');
                            return `${year}-${month}-${day}T${hours}:${minutes}`;
                        } catch {
                            return '';
                        }
                    };

                    // Convert datetime-local format back to ISO 8601
                    const convertFromLocalDateTime = (localDateTime: string): string => {
                        if (!localDateTime) return '';
                        try {
                            // Parse the local datetime and convert to ISO string
                            const date = new Date(localDateTime);
                            return date.toISOString();
                        } catch {
                            return '';
                        }
                    };

                    const localValue = convertToLocalDateTime(value as string);

                    return (
                        <div className="space-y-1">
                            <Input
                                type="datetime-local"
                                name={key}
                                value={localValue}
                                onChange={(e) => {
                                    const isoValue = convertFromLocalDateTime(e.target.value);
                                    updateConfig(key, isoValue || undefined);
                                }}
                                placeholder={schema.description || 'Select date and time'}
                                className={hasError ? 'border-red-500 focus:border-red-500' : ''}
                            />
                            {hasError && (
                                <p className="text-sm text-red-500">{errorMessage}</p>
                            )}
                        </div>
                    );
                }

                // Special handling for date-time fields in Post Data Source
                if (nodeData?.type === 'post_datasource' && (key === 'startDate' || key === 'endDate' || key === 'postedAtStart' || key === 'postedAtEnd') && schema.format === 'date-time') {
                    // Convert ISO 8601 to datetime-local format (YYYY-MM-DDTHH:mm)
                    const convertToLocalDateTime = (isoString: string | undefined): string => {
                        if (!isoString) return '';
                        try {
                            const date = new Date(isoString);
                            // Format as YYYY-MM-DDTHH:mm (datetime-local format)
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            const hours = String(date.getHours()).padStart(2, '0');
                            const minutes = String(date.getMinutes()).padStart(2, '0');
                            return `${year}-${month}-${day}T${hours}:${minutes}`;
                        } catch {
                            return '';
                        }
                    };

                    // Convert datetime-local format back to ISO 8601
                    const convertFromLocalDateTime = (localDateTime: string): string => {
                        if (!localDateTime) return '';
                        try {
                            // Parse the local datetime and convert to ISO string
                            const date = new Date(localDateTime);
                            return date.toISOString();
                        } catch {
                            return '';
                        }
                    };

                    const localValue = convertToLocalDateTime(value as string);

                    return (
                        <div className="space-y-1">
                            <Input
                                type="datetime-local"
                                name={key}
                                value={localValue}
                                onChange={(e) => {
                                    const isoValue = convertFromLocalDateTime(e.target.value);
                                    updateConfig(key, isoValue || undefined);
                                }}
                                placeholder={schema.description || 'Select date and time'}
                                className={hasError ? 'border-red-500 focus:border-red-500' : ''}
                            />
                            {hasError && (
                                <p className="text-sm text-red-500">{errorMessage}</p>
                            )}
                        </div>
                    );
                }

                return (
                    <div className="space-y-1">
                        <Input
                            name={key}
                            value={value || ''}
                            onChange={(e) => updateConfig(key, e.target.value)}
                            placeholder={schema.description}
                            className={hasError ? 'border-red-500 focus:border-red-500' : ''}
                        />
                        {hasError && (
                            <p className="text-sm text-red-500">{errorMessage}</p>
                        )}
                    </div>
                );

            case 'number':
                return (
                    <div className="space-y-1">
                        <Input
                            name={key}
                            type="text"
                            value={value !== undefined && value !== null ? value.toString() : ''}
                            onChange={(e) => {
                                const inputValue = e.target.value;
                                // Allow any input while typing, validate on blur
                                updateConfig(key, inputValue === '' ? undefined : inputValue);
                            }}
                            onBlur={(e) => {
                                // Validate input on blur but don't trigger auto-save
                                const inputValue = e.target.value;
                                if (inputValue === '' || inputValue === '.') {
                                    // Reset to 0 without triggering auto-save
                                    const newConfig = { ...nodeData.config, [key]: 0 };
                                    setNodeData({ ...nodeData, config: newConfig });
                                } else {
                                    const numValue = parseFloat(inputValue);
                                    if (!isNaN(numValue)) {
                                        // Clamp value to min/max if specified
                                        let clampedValue = numValue;
                                        if (schema.minimum !== undefined && clampedValue < schema.minimum) {
                                            clampedValue = schema.minimum;
                                        }
                                        if (schema.maximum !== undefined && clampedValue > schema.maximum) {
                                            clampedValue = schema.maximum;
                                        }
                                        // Update without triggering auto-save
                                        const newConfig = { ...nodeData.config, [key]: clampedValue };
                                        setNodeData({ ...nodeData, config: newConfig });
                                    } else {
                                        // Invalid input, reset to 0 without triggering auto-save
                                        const newConfig = { ...nodeData.config, [key]: 0 };
                                        setNodeData({ ...nodeData, config: newConfig });
                                    }
                                }
                            }}
                            placeholder={schema.description || `Enter a number${schema.minimum !== undefined ? ` (${schema.minimum}-${schema.maximum || '∞'})` : ''}`}
                            className={hasError ? 'border-red-500 focus:border-red-500' : ''}
                        />
                        {hasError && (
                            <p className="text-sm text-red-500">{errorMessage}</p>
                        )}
                    </div>
                );

            case 'boolean':
                return (
                    <div className="flex items-center space-x-2">
                        <Switch
                            checked={value || false}
                            onCheckedChange={(checked) => updateConfig(key, checked)}
                        />
                        <Label className="text-sm">{key}</Label>
                    </div>
                );

            case 'array':
                return (
                    <div className="space-y-1">
                        <Textarea
                            name={key}
                            value={Array.isArray(value) ? value.join('\n') : ''}
                            onChange={(e) => updateConfig(key, e.target.value.split('\n').filter(Boolean))}
                            placeholder={schema.description}
                            rows={3}
                            className={hasError ? 'border-red-500 focus:border-red-500' : ''}
                        />
                        {hasError && (
                            <p className="text-sm text-red-500">{errorMessage}</p>
                        )}
                    </div>
                );

            case 'object':
                return (
                    <div className="space-y-1">
                        <Textarea
                            name={key}
                            value={typeof value === 'object' ? JSON.stringify(value, null, 2) : ''}
                            onChange={(e) => {
                                try {
                                    updateConfig(key, JSON.parse(e.target.value));
                                } catch {
                                    // Invalid JSON, keep as string for now
                                }
                            }}
                            placeholder={schema.description}
                            rows={4}
                            className={hasError ? 'border-red-500 focus:border-red-500' : ''}
                        />
                        {hasError && (
                            <p className="text-sm text-red-500">{errorMessage}</p>
                        )}
                    </div>
                );

            default:
                return (
                    <div className="space-y-1">
                        <Input
                            name={key}
                            value={value || ''}
                            onChange={(e) => updateConfig(key, e.target.value)}
                            placeholder={schema.description}
                            className={hasError ? 'border-red-500 focus:border-red-500' : ''}
                        />
                        {hasError && (
                            <p className="text-sm text-red-500">{errorMessage}</p>
                        )}
                    </div>
                );
        }
    }

    // Special renderer for Post Upserter field mappings
    function renderFieldMappingsConfig(key: string, schema: Record<string, any>) {
        if (!nodeData) return null;
        const previousOutputFields = getPreviousOutputFields();
        const fieldMappings = nodeData.config?.fieldMappings || {};

        const updateFieldMapping = (fieldKey: string, fieldValue: string | Record<string, any>) => {
            const newFieldMappings = {
                ...fieldMappings,
                [fieldKey]: fieldValue || undefined
            };
            // Remove undefined values
            Object.keys(newFieldMappings).forEach(k => {
                if (newFieldMappings[k] === undefined) {
                    delete newFieldMappings[k];
                }
            });
            updateConfig(key, Object.keys(newFieldMappings).length > 0 ? newFieldMappings : undefined);
        };

        return (
            <div key={key} className="space-y-3 p-4 border rounded-lg bg-gray-50">
                <div>
                    <Label className="text-sm font-medium">
                        {schema.title || 'Field Mappings'}
                    </Label>
                    {schema.description && (
                        <p className="text-xs text-gray-500 mt-1">{schema.description}</p>
                    )}
                </div>
                <div className="space-y-3">
                    {/* Title - Must select from input data */}
                    <div className="space-y-1">
                        <Label htmlFor={`${key}.title`} className="text-xs font-medium text-gray-700">
                            Title <span className="text-red-500">*</span>
                        </Label>
                        {previousOutputFields.length > 0 ? (
                            <div className="flex gap-2">
                                <Select
                                    value={fieldMappings.title || ''}
                                    onValueChange={(val) => updateFieldMapping('title', val)}
                                    required
                                >
                                    <SelectTrigger className="h-8 text-sm flex-1">
                                        <SelectValue placeholder="Select title field from input data" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {previousOutputFields.map((field) => (
                                            <SelectItem key={field} value={field}>
                                                {field}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {fieldMappings.title && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => updateFieldMapping('title', '')}
                                        className="h-8"
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <div className="p-2 bg-amber-50 rounded text-xs text-amber-700">
                                Run the previous step first to see available fields for title mapping
                            </div>
                        )}
                        <p className="text-xs text-gray-500">Select which field from input data contains the title</p>
                    </div>

                    {/* Provider - Free text input */}
                    <div className="space-y-1">
                        <Label htmlFor={`${key}.provider`} className="text-xs font-medium text-gray-700">
                            Provider (Field Path)
                        </Label>
                        <Input
                            id={`${key}.provider`}
                            value={fieldMappings.provider || ''}
                            onChange={(e) => updateFieldMapping('provider', e.target.value)}
                            placeholder="Enter provider field path or leave empty"
                            className="h-8 text-sm"
                        />
                        <p className="text-xs text-gray-500">Enter the field path from input data, or leave empty to use default value</p>
                    </div>

                    {/* Source - Select from input data */}
                    <div className="space-y-1">
                        <Label htmlFor={`${key}.source`} className="text-xs font-medium text-gray-700">
                            Source
                        </Label>
                        {previousOutputFields.length > 0 ? (
                            <div className="flex gap-2">
                                <Select
                                    value={fieldMappings.source || ''}
                                    onValueChange={(val) => updateFieldMapping('source', val)}
                                >
                                    <SelectTrigger className="h-8 text-sm flex-1">
                                        <SelectValue placeholder="Select source field from input data" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {previousOutputFields.map((field) => (
                                            <SelectItem key={field} value={field}>
                                                {field}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {fieldMappings.source && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => updateFieldMapping('source', '')}
                                        className="h-8"
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <div className="p-2 bg-amber-50 rounded text-xs text-amber-700">
                                Run the previous step first to see available fields for source mapping
                            </div>
                        )}
                        <p className="text-xs text-gray-500">Select which field from input data contains the source</p>
                    </div>

                    {/* Posted At - Select from input data */}
                    <div className="space-y-1">
                        <Label htmlFor={`${key}.postedAt`} className="text-xs font-medium text-gray-700">
                            Posted At
                        </Label>
                        {previousOutputFields.length > 0 ? (
                            <div className="flex gap-2">
                                <Select
                                    value={fieldMappings.postedAt || ''}
                                    onValueChange={(val) => updateFieldMapping('postedAt', val)}
                                >
                                    <SelectTrigger className="h-8 text-sm flex-1">
                                        <SelectValue placeholder="Select posted_at field from input data" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {previousOutputFields.map((field) => (
                                            <SelectItem key={field} value={field}>
                                                {field}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {fieldMappings.postedAt && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => updateFieldMapping('postedAt', '')}
                                        className="h-8"
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <div className="p-2 bg-amber-50 rounded text-xs text-amber-700">
                                Run the previous step first to see available fields for posted_at mapping
                            </div>
                        )}
                        <p className="text-xs text-gray-500">Select which field from input data contains the posted_at date (supports ISO strings, Unix timestamps, or Date objects)</p>
                    </div>

                    {/* Meta field mappings */}
                    <div className="space-y-2 pt-2 border-t">
                        <Label className="text-xs font-medium text-gray-700">Meta Field Mappings</Label>
                        <p className="text-xs text-gray-500">
                            Map additional fields to post meta. Format: JSON object like {"{"}"metaKey": "inputFieldPath"{"}"}
                        </p>
                        <Textarea
                            value={fieldMappings.meta ? JSON.stringify(fieldMappings.meta, null, 2) : ''}
                            onChange={(e) => {
                                try {
                                    const metaValue = e.target.value.trim() ? JSON.parse(e.target.value) : undefined;
                                    updateFieldMapping('meta', metaValue);
                                } catch {
                                    // Invalid JSON, keep as is
                                }
                            }}
                            placeholder='{"site": "site", "channel": "channel", "author": "author_name"}'
                            rows={3}
                            className="text-sm font-mono"
                        />
                    </div>
                </div>
            </div>
        );
    }

    // Special renderer for Post Deleter Field Mappings (simplified - only ID field)
    function renderPostDeleterFieldMappingsConfig(key: string, schema: Record<string, any>) {
        if (!nodeData) return null;
        const previousOutputFields = getPreviousOutputFields();
        const fieldMappings = nodeData.config?.fieldMappings || {};

        const updateFieldMapping = (fieldKey: string, fieldValue: string) => {
            const newFieldMappings = {
                ...fieldMappings,
                [fieldKey]: fieldValue || undefined
            };
            // Remove undefined values
            Object.keys(newFieldMappings).forEach(k => {
                if (newFieldMappings[k] === undefined) {
                    delete newFieldMappings[k];
                }
            });
            updateConfig(key, Object.keys(newFieldMappings).length > 0 ? newFieldMappings : undefined);
        };

        return (
            <div key={key} className="space-y-3 p-4 border rounded-lg bg-gray-50">
                <div>
                    <Label className="text-sm font-medium">
                        {schema.title || 'Field Mappings'}
                    </Label>
                    {schema.description && (
                        <p className="text-xs text-gray-500 mt-1">{schema.description}</p>
                    )}
                </div>
                <div className="space-y-3">
                    {/* ID Field - Select from input data */}
                    <div className="space-y-1">
                        <Label htmlFor={`${key}.id`} className="text-xs font-medium text-gray-700">
                            Post ID Field
                        </Label>
                        {previousOutputFields.length > 0 ? (
                            <div className="flex gap-2">
                                <Select
                                    value={fieldMappings.id || 'id'}
                                    onValueChange={(val) => updateFieldMapping('id', val)}
                                >
                                    <SelectTrigger className="h-8 text-sm flex-1">
                                        <SelectValue placeholder="Select ID field from input data" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {previousOutputFields.map((field) => (
                                            <SelectItem key={field} value={field}>
                                                {field}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {fieldMappings.id && fieldMappings.id !== 'id' && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => updateFieldMapping('id', 'id')}
                                        className="h-8"
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <div className="p-2 bg-amber-50 rounded text-xs text-amber-700">
                                Run the previous step first to see available fields for ID mapping
                            </div>
                        )}
                        <p className="text-xs text-gray-500">Select which field from input data contains the post ID. Defaults to "id" if not specified.</p>
                    </div>
                </div>
            </div>
        );
    }

    // Special renderer for Hash Config
    function renderHashConfig(key: string, schema: Record<string, any>) {
        if (!nodeData) return null;
        const previousOutputFields = getPreviousOutputFields();
        const hashConfig = nodeData.config?.hashConfig || {};

        const updateHashConfig = (fieldKey: string, value: any) => {
            const newHashConfig = {
                ...hashConfig,
                [fieldKey]: value
            };
            updateConfig(key, newHashConfig);
        };

        const hasError = validationError === key || (!hashConfig.fields || hashConfig.fields.length === 0);
        const errorMessage = hasError ? 'Hash configuration is required. Please add at least one field for hash calculation.' : '';

        return (
            <div key={key} className={`space-y-3 p-4 border rounded-lg ${hasError ? 'border-red-500 bg-red-50' : 'bg-gray-50'}`}>
                <div>
                    <Label className="text-sm font-medium">
                        {schema.title || 'Hash Configuration'}
                        <span className="text-red-500 ml-1">*</span>
                    </Label>
                    {schema.description && (
                        <p className="text-xs text-gray-500 mt-1">{schema.description}</p>
                    )}
                    <p className="text-xs text-red-600 mt-1 font-medium">Required: Hash configuration is required for post deduplication</p>
                    {hasError && (
                        <p className="text-sm text-red-600 mt-2 font-medium">{errorMessage}</p>
                    )}
                </div>
                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label className="text-xs font-medium text-gray-700">
                            Fields <span className="text-red-500">*</span>
                        </Label>
                        <p className="text-xs text-gray-500">Select fields from input data to use for hash calculation</p>
                        {previousOutputFields.length > 0 ? (
                            <div className="space-y-2">
                                {Array.isArray(hashConfig.fields) && hashConfig.fields.length > 0 ? hashConfig.fields.map((field: string, idx: number) => (
                                    <div key={idx} className="flex gap-2">
                                        <Select
                                            value={field || ''}
                                            onValueChange={(val) => {
                                                const newFields = [...hashConfig.fields];
                                                newFields[idx] = val;
                                                updateHashConfig('fields', newFields.filter(f => f && f.trim()));
                                            }}
                                        >
                                            <SelectTrigger className="h-8 text-sm flex-1">
                                                <SelectValue placeholder="Select field" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {previousOutputFields.map((f) => (
                                                    <SelectItem key={f} value={f}>{f}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                const newFields = hashConfig.fields.filter((_: any, i: number) => i !== idx);
                                                updateHashConfig('fields', newFields.length > 0 ? newFields.filter((f: string) => f && f.trim()) : undefined);
                                            }}
                                        >
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                )) : (
                                    <p className="text-xs text-gray-400">No fields added</p>
                                )}
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        const firstField = previousOutputFields[0] || '';
                                        if (firstField) {
                                            const newFields = [...(hashConfig.fields || []), firstField];
                                            updateHashConfig('fields', newFields);
                                        }
                                    }}
                                    className="w-full"
                                >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Add Field
                                </Button>
                            </div>
                        ) : (
                            <Textarea
                                value={Array.isArray(hashConfig.fields) ? hashConfig.fields.join('\n') : ''}
                                onChange={(e) => updateHashConfig('fields', e.target.value.split('\n').filter(Boolean))}
                                placeholder="Enter field names, one per line"
                                rows={3}
                                className="text-sm"
                            />
                        )}
                    </div>

                    {/* Advanced Options - Collapsed by default */}
                    <div className="border-t pt-3">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                const newState = !(nodeData.config?.hashConfig?._advancedOpen || false);
                                updateHashConfig('_advancedOpen', newState);
                            }}
                            className="w-full justify-between p-0 h-auto"
                        >
                            <span className="text-xs font-medium text-gray-700">Advanced Options</span>
                            {(hashConfig._advancedOpen || false) ? (
                                <ChevronDown className="h-4 w-4" />
                            ) : (
                                <ChevronRight className="h-4 w-4" />
                            )}
                        </Button>
                        {(hashConfig._advancedOpen || false) && (
                            <div className="space-y-3 mt-3">
                                <div className="space-y-1">
                                    <Label className="text-xs font-medium text-gray-700">Algorithm</Label>
                                    <Select
                                        value={hashConfig.algorithm || 'md5'}
                                        onValueChange={(val) => updateHashConfig('algorithm', val)}
                                    >
                                        <SelectTrigger className="h-8 text-sm">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="md5">MD5 (Fastest/Shortest)</SelectItem>
                                            <SelectItem value="sha256">SHA-256</SelectItem>
                                            <SelectItem value="sha512">SHA-512</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-gray-500">Default: MD5 (fastest and shortest)</p>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-medium text-gray-700">Separator</Label>
                                    <Input
                                        value={hashConfig.separator || '|'}
                                        onChange={(e) => updateHashConfig('separator', e.target.value)}
                                        placeholder="|"
                                        className="h-8 text-sm"
                                    />
                                    <p className="text-xs text-gray-500">Separator used when combining fields for hash calculation</p>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-medium text-gray-700">Prefix (Optional)</Label>
                                    <Input
                                        value={hashConfig.prefix || ''}
                                        onChange={(e) => updateHashConfig('prefix', e.target.value || undefined)}
                                        placeholder="Optional prefix for hash"
                                        className="h-8 text-sm"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Special renderer for Defaults Config
    function renderDefaultsConfig(key: string, schema: Record<string, any>) {
        if (!nodeData) return null;
        const defaults = nodeData.config?.defaults || {};

        const updateDefault = (fieldKey: string, value: any) => {
            const newDefaults = {
                ...defaults,
                [fieldKey]: value || undefined
            };
            // Remove undefined values
            Object.keys(newDefaults).forEach(k => {
                if (newDefaults[k] === undefined) {
                    delete newDefaults[k];
                }
            });
            updateConfig(key, Object.keys(newDefaults).length > 0 ? newDefaults : undefined);
        };

        return (
            <div key={key} className="space-y-3 p-4 border rounded-lg bg-gray-50">
                <div>
                    <Label className="text-sm font-medium">
                        {schema.title || 'Default Values'}
                    </Label>
                    {schema.description && (
                        <p className="text-xs text-gray-500 mt-1">{schema.description}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                        These values will be used if field mappings are empty. User ID will automatically use the authenticated user.
                    </p>
                </div>
                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label className="text-xs font-medium text-gray-700">Provider</Label>
                        <Input
                            value={defaults.provider || ''}
                            onChange={(e) => updateDefault('provider', e.target.value)}
                            placeholder="Default provider value"
                            className="h-8 text-sm"
                        />
                        <p className="text-xs text-gray-500">Used when provider field mapping is empty</p>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs font-medium text-gray-700">Source</Label>
                        <Input
                            value={defaults.source || ''}
                            onChange={(e) => updateDefault('source', e.target.value)}
                            placeholder="Default source value"
                            className="h-8 text-sm"
                        />
                        <p className="text-xs text-gray-500">Used when source field mapping is empty</p>
                    </div>
                </div>
            </div>
        );
    }

    function renderAdvancedConfiguration() {
        if (!nodeData) return null;

        return (
            <div className="space-y-4">
                <div>
                    <Label className="text-sm font-medium">Node ID</Label>
                    <Input
                        value={nodeData.id}
                        disabled
                        className="mt-1 bg-gray-100"
                    />
                </div>

                <div>
                    <Label className="text-sm font-medium">Node Type</Label>
                    <Input
                        value={nodeData.type}
                        disabled
                        className="mt-1 bg-gray-100"
                    />
                </div>

                <div>
                    <Label className="text-sm font-medium">Position</Label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                        <Input
                            type="number"
                            value={nodeData.position.x}
                            onChange={(e) => handleNodeDataChange({
                                position: { ...nodeData.position, x: parseFloat(e.target.value) || 0 }
                            })}
                            placeholder="X"
                        />
                        <Input
                            type="number"
                            value={nodeData.position.y}
                            onChange={(e) => handleNodeDataChange({
                                position: { ...nodeData.position, y: parseFloat(e.target.value) || 0 }
                            })}
                            placeholder="Y"
                        />
                    </div>
                </div>

                <div className="flex items-center space-x-2">
                    <Switch
                        checked={nodeData.enabled ?? true}
                        onCheckedChange={(enabled) => setNodeData({ ...nodeData, enabled })}
                    />
                    <Label className="text-sm">Enabled</Label>
                </div>

                {nodeData.conditions && (
                    <div>
                        <Label className="text-sm font-medium">Conditions</Label>
                        <Textarea
                            value={nodeData.conditions}
                            onChange={(e) => handleNodeDataChange({ conditions: e.target.value })}
                            placeholder="Execution conditions"
                            rows={3}
                        />
                    </div>
                )}
            </div>
        );
    }

    function updateConfig(key: string, value: unknown) {
        if (!nodeData) return;

        const newConfig = { ...nodeData.config, [key]: value };

        // Handle cascade clearing for Data Source node
        if (nodeData.type === 'datasource') {
            if (key === 'datasetId') {
                // Clear document and segment when dataset changes
                delete newConfig.documentId;
                delete newConfig.segmentId;
                setDocumentSearchTerm('');
                setSegmentSearchTerm('');
                setDocuments([]);
                setSegments([]);
                setFilteredDocuments([]);
                setFilteredSegments([]);
            } else if (key === 'documentId') {
                // Clear segment when document changes
                delete newConfig.segmentId;
                setSegmentSearchTerm('');
                setSegments([]);
                setFilteredSegments([]);
            }
        }

        // Use handleNodeDataChange to trigger change detection
        handleNodeDataChange({
            config: newConfig
        });

        // Clear validation error for this field when it's updated
        if (validationError === key) {
            setValidationError(null);
        }
    }

    function getPreviousNode(nodeId: string, nodes: WorkflowNode[]): WorkflowNode | null {
        // Find the node that comes before this one in the workflow
        // For now, we'll assume nodes are ordered by their position in the array
        const currentIndex = nodes.findIndex(n => n.id === nodeId);
        if (currentIndex > 0) {
            return nodes[currentIndex - 1];
        }
        return null;
    }

    // Recursively get all field paths from an object to the deepest level
    // Handles arrays by extracting fields from first non-empty item
    function getDeepFieldPaths(obj: any, prefix: string = '', visited: Set<any> = new Set()): string[] {
        const fields: string[] = [];

        // Prevent circular references
        if (!obj || typeof obj !== 'object' || visited.has(obj)) {
            return fields;
        }
        visited.add(obj);

        // If it's an array, get fields from the first non-empty object element
        if (Array.isArray(obj)) {
            for (const item of obj) {
                if (item && typeof item === 'object') {
                    // If current level already has a prefix, add array index, otherwise skip it
                    const newPrefix = prefix || '';
                    const itemFields = getDeepFieldPaths(item, newPrefix, visited);
                    if (itemFields.length > 0) {
                        fields.push(...itemFields);
                        break; // Just use the first non-empty object
                    }
                }
            }
            return fields;
        }

        // For objects, extract all keys and recursively get nested fields
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const currentPath = prefix ? `${prefix}.${key}` : key;

                // Add the current path
                fields.push(currentPath);

                // Recursively process nested values
                const value = obj[key];
                if (value && typeof value === 'object' && !visited.has(value)) {
                    fields.push(...getDeepFieldPaths(value, currentPath, visited));
                }
            }
        }

        return fields;
    }

    // Get available fields from previous node output for mapping
    // Works with any structure - data, items, or any nested format
    function getPreviousOutputFields(): string[] {
        const previousNode = getPreviousNode(nodeData?.id || '', workflowNodes);
        if (!previousNode?.testOutput) return [];

        // Start from the root of testOutput and get all deep fields
        const allFields = getDeepFieldPaths(previousNode.testOutput);

        // Remove duplicates and sort
        return Array.from(new Set(allFields)).sort();
    }

    // Get field value from previous output for preview (supports nested paths)
    // Works with any structure by searching through the entire output object
    function getPreviousOutputFieldValue(fieldPath: string): unknown {
        const previousNode = getPreviousNode(nodeData?.id || '', workflowNodes);
        if (!previousNode?.testOutput) return null;

        // Function to get nested value using dot notation
        const getNestedValue = (obj: any, path: string): unknown => {
            if (!obj || !path) return null;

            const parts = path.split('.');
            let value: any = obj;

            for (const part of parts) {
                if (value && typeof value === 'object') {
                    // Handle arrays: get first item if it's an array
                    if (Array.isArray(value) && value.length > 0) {
                        value = value[0];
                    }
                    value = value[part];
                } else {
                    return null;
                }
            }

            return value;
        };

        // Try to get value - the function will automatically handle arrays
        return getNestedValue(previousNode.testOutput, fieldPath);
    }
}

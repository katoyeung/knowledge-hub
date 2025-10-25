'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Plus, Trash2, Edit, Copy, Check, X, AlertTriangle, Info, Code
} from 'lucide-react';

export interface FilterRule {
    id: string;
    name: string;
    pattern: string;
    flags?: string;
    action: 'remove' | 'keep' | 'flag';
    description?: string;
    enabled: boolean;
}

export interface RuleBasedFilterConfig {
    rules: FilterRule[];
    defaultAction: 'keep' | 'remove';
    caseSensitive?: boolean;
    wholeWord?: boolean;
    minContentLength?: number;
    maxContentLength?: number;
    preserveEmptySegments?: boolean;
}

interface RuleBasedFilterConfigProps {
    config: RuleBasedFilterConfig;
    onChange: (config: RuleBasedFilterConfig) => void;
    onValidate?: (isValid: boolean, errors: string[]) => void;
}

// Example rule templates
const EXAMPLE_RULES: FilterRule[] = [
    {
        id: 'remove-short-content',
        name: 'Remove Short Content',
        pattern: '^.{0,10}$',
        flags: '',
        action: 'remove',
        description: 'Remove segments with 10 characters or less',
        enabled: true
    },
    {
        id: 'remove-html-tags',
        name: 'Remove HTML Tags',
        pattern: '<[^>]*>',
        flags: 'g',
        action: 'remove',
        description: 'Remove segments containing HTML tags',
        enabled: true
    },
    {
        id: 'keep-important-keywords',
        name: 'Keep Important Keywords',
        pattern: '(important|urgent|critical|priority)',
        flags: 'i',
        action: 'keep',
        description: 'Keep segments containing important keywords',
        enabled: true
    },
    {
        id: 'flag-spam-patterns',
        name: 'Flag Spam Patterns',
        pattern: '(spam|scam|phishing|malware)',
        flags: 'i',
        action: 'flag',
        description: 'Flag segments containing spam-related terms',
        enabled: true
    },
    {
        id: 'remove-numeric-only',
        name: 'Remove Numeric Only',
        pattern: '^[0-9\\s\\.,-]+$',
        flags: '',
        action: 'remove',
        description: 'Remove segments containing only numbers and basic punctuation',
        enabled: true
    }
];

const EXAMPLE_CONFIG: RuleBasedFilterConfig = {
    rules: EXAMPLE_RULES,
    defaultAction: 'keep',
    caseSensitive: false,
    wholeWord: false,
    minContentLength: 20,
    maxContentLength: 5000,
    preserveEmptySegments: false
};

export function RuleBasedFilterConfig({ config, onChange, onValidate }: RuleBasedFilterConfigProps) {
    const [rules, setRules] = useState<FilterRule[]>(config.rules || []);
    const [jsonInput, setJsonInput] = useState('');
    const [showJsonEditor, setShowJsonEditor] = useState(false);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [editingRule, setEditingRule] = useState<FilterRule | null>(null);
    const [showExamples, setShowExamples] = useState(false);

    // Initialize JSON input when component mounts
    useEffect(() => {
        setJsonInput(JSON.stringify(config, null, 2));
    }, []);

    // Update rules when config changes
    useEffect(() => {
        setRules(config.rules || []);
    }, [config.rules]);

    // Validate configuration
    useEffect(() => {
        const errors: string[] = [];

        if (!rules || rules.length === 0) {
            errors.push('At least one rule is required');
        }

        rules.forEach((rule, index) => {
            if (!rule.id) {
                errors.push(`Rule ${index + 1}: ID is required`);
            }
            if (!rule.name) {
                errors.push(`Rule ${index + 1}: Name is required`);
            }
            if (!rule.pattern) {
                errors.push(`Rule ${index + 1}: Pattern is required`);
            } else {
                try {
                    new RegExp(rule.pattern, rule.flags || '');
                } catch (regexError) {
                    errors.push(`Rule ${index + 1}: Invalid regex pattern - ${regexError.message}`);
                }
            }
            if (!rule.action || !['remove', 'keep', 'flag'].includes(rule.action)) {
                errors.push(`Rule ${index + 1}: Action must be one of: remove, keep, flag`);
            }
        });

        if (!config.defaultAction || !['keep', 'remove'].includes(config.defaultAction)) {
            errors.push('Default action must be one of: keep, remove');
        }

        if (config.minContentLength !== undefined && config.minContentLength < 0) {
            errors.push('Minimum content length must be non-negative');
        }

        if (config.maxContentLength !== undefined && config.maxContentLength < 0) {
            errors.push('Maximum content length must be non-negative');
        }

        if (
            config.minContentLength !== undefined &&
            config.maxContentLength !== undefined &&
            config.minContentLength > config.maxContentLength
        ) {
            errors.push('Minimum content length cannot be greater than maximum content length');
        }

        setValidationErrors(errors);
        onValidate?.(errors.length === 0, errors);
    }, [config, rules, onValidate]);

    const addRule = () => {
        const newRule: FilterRule = {
            id: `rule-${Date.now()}`,
            name: 'New Rule',
            pattern: '',
            flags: '',
            action: 'remove',
            description: '',
            enabled: true
        };
        const newRules = [...rules, newRule];
        setRules(newRules);
        updateConfig({ ...config, rules: newRules });
    };

    const updateRule = (index: number, updatedRule: FilterRule) => {
        const newRules = [...rules];
        newRules[index] = updatedRule;
        setRules(newRules);
        updateConfig({ ...config, rules: newRules });
    };

    const deleteRule = (index: number) => {
        const newRules = rules.filter((_, i) => i !== index);
        setRules(newRules);
        updateConfig({ ...config, rules: newRules });
    };

    const duplicateRule = (index: number) => {
        const ruleToDuplicate = rules[index];
        const duplicatedRule: FilterRule = {
            ...ruleToDuplicate,
            id: `rule-${Date.now()}`,
            name: `${ruleToDuplicate.name} (Copy)`
        };
        const newRules = [...rules, duplicatedRule];
        setRules(newRules);
        updateConfig({ ...config, rules: newRules });
    };

    const loadExampleRules = () => {
        setRules(EXAMPLE_RULES);
        updateConfig({ ...config, rules: EXAMPLE_RULES });
        setShowExamples(false);
    };

    const loadExampleConfig = () => {
        const newConfig = { ...EXAMPLE_CONFIG };
        setRules(newConfig.rules);
        updateConfig(newConfig);
        setJsonInput(JSON.stringify(newConfig, null, 2));
        setShowExamples(false);
    };

    const updateConfig = (newConfig: RuleBasedFilterConfig) => {
        onChange(newConfig);
    };

    const handleJsonInput = (jsonString: string) => {
        setJsonInput(jsonString);
        try {
            const parsedConfig = JSON.parse(jsonString);
            if (parsedConfig.rules && Array.isArray(parsedConfig.rules)) {
                setRules(parsedConfig.rules);
                updateConfig(parsedConfig);
            }
        } catch (error) {
            // Invalid JSON, don't update config
        }
    };

    const applyJsonConfig = () => {
        try {
            const parsedConfig = JSON.parse(jsonInput);
            if (parsedConfig.rules && Array.isArray(parsedConfig.rules)) {
                setRules(parsedConfig.rules);
                updateConfig(parsedConfig);
            }
        } catch (error) {
            setValidationErrors([`Invalid JSON: ${error.message}`]);
        }
    };

    const generateRuleId = (name: string) => {
        return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    };

    return (
        <div className="space-y-6">
            {/* Header with Examples */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold">Rule-Based Content Filtering</h3>
                    <p className="text-sm text-gray-600">
                        Configure filtering rules using regex patterns to filter document segments
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowExamples(!showExamples)}
                    >
                        <Info className="h-4 w-4 mr-2" />
                        Examples
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowJsonEditor(!showJsonEditor)}
                    >
                        <Code className="h-4 w-4 mr-2" />
                        {showJsonEditor ? 'Form Editor' : 'JSON Editor'}
                    </Button>
                </div>
            </div>

            {/* Examples Panel */}
            {showExamples && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm">Example Configurations</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <h4 className="font-medium mb-2">Example Rules Only</h4>
                                <p className="text-sm text-gray-600 mb-3">
                                    Load common filtering rules for content processing
                                </p>
                                <Button size="sm" onClick={loadExampleRules}>
                                    Load Example Rules
                                </Button>
                            </div>
                            <div>
                                <h4 className="font-medium mb-2">Complete Example</h4>
                                <p className="text-sm text-gray-600 mb-3">
                                    Load a complete configuration with all settings
                                </p>
                                <Button size="sm" onClick={loadExampleConfig}>
                                    Load Complete Example
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                        <div className="space-y-1">
                            {validationErrors.map((error, index) => (
                                <div key={index} className="text-sm">{error}</div>
                            ))}
                        </div>
                    </AlertDescription>
                </Alert>
            )}

            {/* Main Configuration */}
            <Tabs defaultValue="rules" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="rules">Rules ({rules.length})</TabsTrigger>
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                    <TabsTrigger value="json">JSON Editor</TabsTrigger>
                </TabsList>

                <TabsContent value="rules" className="space-y-4">
                    {/* Rules List */}
                    <div className="space-y-3">
                        {rules.map((rule, index) => (
                            <Card key={rule.id} className={`${!rule.enabled ? 'opacity-60' : ''}`}>
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <Switch
                                                checked={rule.enabled}
                                                onCheckedChange={(enabled) => updateRule(index, { ...rule, enabled })}
                                            />
                                            <div>
                                                <h4 className="font-medium">{rule.name}</h4>
                                                <p className="text-sm text-gray-600">{rule.description}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setEditingRule(rule)}
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => duplicateRule(index)}
                                            >
                                                <Copy className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => deleteRule(index)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                                        <div>
                                            <Label className="text-xs font-medium">Pattern</Label>
                                            <div className="mt-1 p-2 bg-gray-100 rounded font-mono text-xs">
                                                {rule.pattern || 'No pattern'}
                                            </div>
                                        </div>
                                        <div>
                                            <Label className="text-xs font-medium">Flags</Label>
                                            <div className="mt-1 p-2 bg-gray-100 rounded font-mono text-xs">
                                                {rule.flags || 'None'}
                                            </div>
                                        </div>
                                        <div>
                                            <Label className="text-xs font-medium">Action</Label>
                                            <div className="mt-1">
                                                <Badge variant={rule.action === 'remove' ? 'destructive' : rule.action === 'keep' ? 'default' : 'secondary'}>
                                                    {rule.action}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {/* Add Rule Button */}
                    <Button onClick={addRule} className="w-full">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Rule
                    </Button>
                </TabsContent>

                <TabsContent value="settings" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label>Default Action</Label>
                            <Select
                                value={config.defaultAction}
                                onValueChange={(value: 'keep' | 'remove') => updateConfig({ ...config, defaultAction: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="keep">Keep (pass through)</SelectItem>
                                    <SelectItem value="remove">Remove (filter out)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center space-x-2">
                            <Switch
                                checked={config.caseSensitive || false}
                                onCheckedChange={(checked) => updateConfig({ ...config, caseSensitive: checked })}
                            />
                            <Label>Case Sensitive</Label>
                        </div>

                        <div className="flex items-center space-x-2">
                            <Switch
                                checked={config.wholeWord || false}
                                onCheckedChange={(checked) => updateConfig({ ...config, wholeWord: checked })}
                            />
                            <Label>Whole Word Matching</Label>
                        </div>

                        <div className="flex items-center space-x-2">
                            <Switch
                                checked={config.preserveEmptySegments || false}
                                onCheckedChange={(checked) => updateConfig({ ...config, preserveEmptySegments: checked })}
                            />
                            <Label>Preserve Empty Segments</Label>
                        </div>

                        <div>
                            <Label>Minimum Content Length</Label>
                            <Input
                                type="number"
                                value={config.minContentLength || ''}
                                onChange={(e) => updateConfig({ ...config, minContentLength: e.target.value ? parseInt(e.target.value) : undefined })}
                                placeholder="No minimum"
                            />
                        </div>

                        <div>
                            <Label>Maximum Content Length</Label>
                            <Input
                                type="number"
                                value={config.maxContentLength || ''}
                                onChange={(e) => updateConfig({ ...config, maxContentLength: e.target.value ? parseInt(e.target.value) : undefined })}
                                placeholder="No maximum"
                            />
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="json" className="space-y-4">
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label>JSON Configuration</Label>
                            <Button size="sm" onClick={applyJsonConfig}>
                                <Check className="h-4 w-4 mr-2" />
                                Apply JSON
                            </Button>
                        </div>
                        <Textarea
                            value={jsonInput}
                            onChange={(e) => handleJsonInput(e.target.value)}
                            placeholder="Enter JSON configuration..."
                            rows={20}
                            className="font-mono text-sm"
                        />
                        <p className="text-xs text-gray-600">
                            Edit the JSON configuration directly. Changes will be validated when you click "Apply JSON".
                        </p>
                    </div>
                </TabsContent>
            </Tabs>

            {/* Rule Editor Modal */}
            {editingRule && (
                <RuleEditor
                    rule={editingRule}
                    onSave={(updatedRule) => {
                        const index = rules.findIndex(r => r.id === editingRule.id);
                        if (index !== -1) {
                            updateRule(index, updatedRule);
                        }
                        setEditingRule(null);
                    }}
                    onCancel={() => setEditingRule(null)}
                />
            )}
        </div>
    );
}

// Rule Editor Component
interface RuleEditorProps {
    rule: FilterRule;
    onSave: (rule: FilterRule) => void;
    onCancel: () => void;
}

function RuleEditor({ rule, onSave, onCancel }: RuleEditorProps) {
    const [editedRule, setEditedRule] = useState<FilterRule>({ ...rule });

    const handleSave = () => {
        // Generate ID from name if not set
        if (!editedRule.id) {
            editedRule.id = generateRuleId(editedRule.name);
        }
        onSave(editedRule);
    };

    const generateRuleId = (name: string) => {
        return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
                <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Edit Rule</h3>
                        <Button variant="ghost" size="sm" onClick={onCancel}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <Label>Rule Name</Label>
                            <Input
                                value={editedRule.name}
                                onChange={(e) => setEditedRule({ ...editedRule, name: e.target.value })}
                                placeholder="Enter rule name"
                            />
                        </div>

                        <div>
                            <Label>Description</Label>
                            <Input
                                value={editedRule.description || ''}
                                onChange={(e) => setEditedRule({ ...editedRule, description: e.target.value })}
                                placeholder="Enter rule description"
                            />
                        </div>

                        <div>
                            <Label>Regex Pattern</Label>
                            <Textarea
                                value={editedRule.pattern}
                                onChange={(e) => setEditedRule({ ...editedRule, pattern: e.target.value })}
                                placeholder="Enter regex pattern"
                                rows={3}
                                className="font-mono text-sm"
                            />
                            <p className="text-xs text-gray-600 mt-1">
                                Use standard regex syntax. Test your pattern at regex101.com
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Regex Flags</Label>
                                <Input
                                    value={editedRule.flags || ''}
                                    onChange={(e) => setEditedRule({ ...editedRule, flags: e.target.value })}
                                    placeholder="e.g., i, g, m"
                                />
                                <p className="text-xs text-gray-600 mt-1">
                                    Common flags: i (case-insensitive), g (global), m (multiline)
                                </p>
                            </div>

                            <div>
                                <Label>Action</Label>
                                <Select
                                    value={editedRule.action}
                                    onValueChange={(value: 'remove' | 'keep' | 'flag') => setEditedRule({ ...editedRule, action: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="remove">Remove</SelectItem>
                                        <SelectItem value="keep">Keep</SelectItem>
                                        <SelectItem value="flag">Flag</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="flex items-center space-x-2">
                            <Switch
                                checked={editedRule.enabled}
                                onCheckedChange={(enabled) => setEditedRule({ ...editedRule, enabled })}
                            />
                            <Label>Enabled</Label>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 mt-6">
                        <Button variant="outline" onClick={onCancel}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave}>
                            Save Rule
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

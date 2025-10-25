'use client';

import { useState, useEffect } from 'react';
import { RuleBasedFilterConfig, RuleBasedFilterConfigProps } from './rule-based-filter-config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle } from 'lucide-react';

interface WorkflowNodeRuleFilterProps {
    config: any;
    onChange: (config: any) => void;
    onValidate?: (isValid: boolean, errors: string[]) => void;
}

export function WorkflowNodeRuleFilter({ config, onChange, onValidate }: WorkflowNodeRuleFilterProps) {
    const [filterConfig, setFilterConfig] = useState<RuleBasedFilterConfigProps['config']>({
        rules: config.rules || [],
        defaultAction: config.defaultAction || 'keep',
        caseSensitive: config.caseSensitive || false,
        wholeWord: config.wholeWord || false,
        minContentLength: config.minContentLength,
        maxContentLength: config.maxContentLength,
        preserveEmptySegments: config.preserveEmptySegments || false
    });

    const [validationErrors, setValidationErrors] = useState<string[]>([]);

    useEffect(() => {
        // Update parent config when filter config changes
        onChange(filterConfig);
    }, [filterConfig, onChange]);

    const handleConfigChange = (newConfig: RuleBasedFilterConfigProps['config']) => {
        setFilterConfig(newConfig);
    };

    const handleValidate = (isValid: boolean, errors: string[]) => {
        setValidationErrors(errors);
        onValidate?.(isValid, errors);
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Rule-Based Content Filtering</CardTitle>
                </CardHeader>
                <CardContent>
                    <RuleBasedFilterConfig
                        config={filterConfig}
                        onChange={handleConfigChange}
                        onValidate={handleValidate}
                    />
                </CardContent>
            </Card>

            {/* Validation Summary */}
            {validationErrors.length > 0 && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                        <div className="space-y-1">
                            <div className="font-medium">Configuration Issues:</div>
                            {validationErrors.map((error, index) => (
                                <div key={index} className="text-sm">• {error}</div>
                            ))}
                        </div>
                    </AlertDescription>
                </Alert>
            )}

            {validationErrors.length === 0 && filterConfig.rules.length > 0 && (
                <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                        Configuration is valid with {filterConfig.rules.length} rule(s) configured.
                    </AlertDescription>
                </Alert>
            )}
        </div>
    );
}

// Example usage in workflow node configuration
export function ExampleWorkflowNodeConfig() {
    const [nodeConfig, setNodeConfig] = useState({
        stepType: 'rule_based_filter',
        rules: [],
        defaultAction: 'keep',
        caseSensitive: false,
        wholeWord: false,
        minContentLength: 20,
        maxContentLength: 5000,
        preserveEmptySegments: false
    });

    const [isValid, setIsValid] = useState(false);

    const handleConfigChange = (newConfig: any) => {
        setNodeConfig(newConfig);
    };

    const handleValidate = (valid: boolean, errors: string[]) => {
        setIsValid(valid);
        console.log('Validation:', { valid, errors });
    };

    return (
        <div className="max-w-4xl mx-auto p-6">
            <h1 className="text-2xl font-bold mb-6">Workflow Node Configuration Example</h1>

            <WorkflowNodeRuleFilter
                config={nodeConfig}
                onChange={handleConfigChange}
                onValidate={handleValidate}
            />

            <div className="mt-6 p-4 bg-gray-100 rounded">
                <h3 className="font-medium mb-2">Current Configuration:</h3>
                <pre className="text-sm overflow-auto">
                    {JSON.stringify(nodeConfig, null, 2)}
                </pre>
            </div>

            <div className="mt-4">
                <Button
                    disabled={!isValid}
                    onClick={() => console.log('Saving configuration:', nodeConfig)}
                >
                    {isValid ? 'Save Configuration' : 'Fix Validation Errors First'}
                </Button>
            </div>
        </div>
    );
}

'use client';

import { useState } from 'react';
import { RuleBasedFilterConfig, RuleBasedFilterConfigProps, FilterRule } from '@/components/rule-based-filter-config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

// Sample document segments for testing
const SAMPLE_SEGMENTS = [
    {
        id: '1',
        content: 'This is an important document about machine learning algorithms.',
        metadata: { source: 'research-paper.pdf', page: 1 }
    },
    {
        id: '2',
        content: 'Short.',
        metadata: { source: 'research-paper.pdf', page: 1 }
    },
    {
        id: '3',
        content: 'This segment contains <html>tags</html> that should be filtered out.',
        metadata: { source: 'web-page.html', page: 1 }
    },
    {
        id: '4',
        content: 'This is a critical security alert that requires immediate attention.',
        metadata: { source: 'security-bulletin.pdf', page: 1 }
    },
    {
        id: '5',
        content: '1234567890',
        metadata: { source: 'data.csv', page: 1 }
    },
    {
        id: '6',
        content: 'This is a normal paragraph with useful information about data processing.',
        metadata: { source: 'manual.pdf', page: 5 }
    },
    {
        id: '7',
        content: 'spam content with malicious links and phishing attempts',
        metadata: { source: 'spam-email.txt', page: 1 }
    },
    {
        id: '8',
        content: 'This is a very long segment that contains a lot of detailed information about various topics including machine learning, artificial intelligence, data science, natural language processing, computer vision, deep learning, neural networks, and many other related subjects that might be useful for researchers and practitioners in the field.',
        metadata: { source: 'comprehensive-guide.pdf', page: 10 }
    }
];

export default function RuleBasedFilterDemo() {
    const [config, setConfig] = useState<RuleBasedFilterConfigProps['config']>({
        rules: [],
        defaultAction: 'keep',
        caseSensitive: false,
        wholeWord: false,
        minContentLength: 20,
        maxContentLength: 5000,
        preserveEmptySegments: false
    });

    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [testResults, setTestResults] = useState<any>(null);
    const [isTesting, setIsTesting] = useState(false);

    const handleConfigChange = (newConfig: RuleBasedFilterConfigProps['config']) => {
        setConfig(newConfig);
    };

    const handleValidate = (isValid: boolean, errors: string[]) => {
        setValidationErrors(errors);
    };

    const runTest = async () => {
        setIsTesting(true);

        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Apply filtering rules to sample segments
        const results = applyFilteringRules(SAMPLE_SEGMENTS, config);
        setTestResults(results);
        setIsTesting(false);
    };

    const applyFilteringRules = (segments: any[], config: RuleBasedFilterConfigProps['config']) => {
        const outputSegments = [];
        const filteredSegments = [];
        const ruleMatches: Record<string, number> = {};

        // Initialize rule match counters
        config.rules.forEach(rule => {
            ruleMatches[rule.id] = 0;
        });

        segments.forEach(segment => {
            // Check content length constraints
            if (shouldFilterByLength(segment, config)) {
                filteredSegments.push(segment);
                return;
            }

            // Apply filtering rules
            const ruleResult = applyRules(segment, config, ruleMatches);

            if (ruleResult.action === 'remove') {
                filteredSegments.push(segment);
            } else if (ruleResult.action === 'keep') {
                outputSegments.push(segment);
            } else if (ruleResult.action === 'flag') {
                outputSegments.push({ ...segment, flagged: true, flagReason: ruleResult.ruleName });
            } else {
                // Default action
                if (config.defaultAction === 'remove') {
                    filteredSegments.push(segment);
                } else {
                    outputSegments.push(segment);
                }
            }
        });

        return {
            inputSegments: segments,
            outputSegments,
            filteredSegments,
            metrics: {
                totalProcessed: segments.length,
                kept: outputSegments.length,
                filtered: filteredSegments.length,
                filteringRate: segments.length > 0 ? filteredSegments.length / segments.length : 0,
                ruleMatches
            }
        };
    };

    const shouldFilterByLength = (segment: any, config: RuleBasedFilterConfigProps['config']) => {
        const contentLength = segment.content.length;

        if (config.minContentLength !== undefined && contentLength < config.minContentLength) {
            return true;
        }

        if (config.maxContentLength !== undefined && contentLength > config.maxContentLength) {
            return true;
        }

        if (!config.preserveEmptySegments && contentLength === 0) {
            return true;
        }

        return false;
    };

    const applyRules = (segment: any, config: RuleBasedFilterConfigProps['config'], ruleMatches: Record<string, number>) => {
        for (const rule of config.rules) {
            if (!rule.enabled) continue;

            try {
                const regex = new RegExp(rule.pattern, rule.flags || '');
                const content = config.caseSensitive ? segment.content : segment.content.toLowerCase();

                if (regex.test(content)) {
                    ruleMatches[rule.id]++;
                    return { action: rule.action, ruleName: rule.name };
                }
            } catch (error) {
                console.warn(`Error applying rule ${rule.name}:`, error);
            }
        }

        return { action: config.defaultAction, ruleName: 'default' };
    };

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold">Rule-Based Content Filtering Demo</h1>
                <p className="text-gray-600">
                    Configure filtering rules using JSON objects to filter document segments
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Configuration Panel */}
                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Filter Configuration</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <RuleBasedFilterConfig
                                config={config}
                                onChange={handleConfigChange}
                                onValidate={handleValidate}
                            />
                        </CardContent>
                    </Card>

                    {/* Test Button */}
                    <div className="flex justify-center">
                        <Button
                            onClick={runTest}
                            disabled={isTesting || validationErrors.length > 0}
                            size="lg"
                            className="w-full"
                        >
                            {isTesting ? 'Testing...' : 'Test Filtering Rules'}
                        </Button>
                    </div>

                    {/* Validation Status */}
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
                </div>

                {/* Results Panel */}
                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Test Results</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {testResults ? (
                                <div className="space-y-4">
                                    {/* Metrics */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="text-center p-3 bg-blue-50 rounded">
                                            <div className="text-2xl font-bold text-blue-600">
                                                {testResults.metrics.kept}
                                            </div>
                                            <div className="text-sm text-blue-600">Kept</div>
                                        </div>
                                        <div className="text-center p-3 bg-red-50 rounded">
                                            <div className="text-2xl font-bold text-red-600">
                                                {testResults.metrics.filtered}
                                            </div>
                                            <div className="text-sm text-red-600">Filtered</div>
                                        </div>
                                    </div>

                                    {/* Rule Matches */}
                                    {Object.keys(testResults.metrics.ruleMatches).length > 0 && (
                                        <div>
                                            <h4 className="font-medium mb-2">Rule Matches</h4>
                                            <div className="space-y-1">
                                                {Object.entries(testResults.metrics.ruleMatches).map(([ruleId, count]) => {
                                                    const rule = config.rules.find(r => r.id === ruleId);
                                                    return (
                                                        <div key={ruleId} className="flex justify-between text-sm">
                                                            <span>{rule?.name || ruleId}</span>
                                                            <Badge variant="secondary">{count}</Badge>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Output Segments */}
                                    <div>
                                        <h4 className="font-medium mb-2">Kept Segments</h4>
                                        <div className="space-y-2 max-h-60 overflow-y-auto">
                                            {testResults.outputSegments.map((segment: any) => (
                                                <div key={segment.id} className="p-3 border rounded text-sm">
                                                    <div className="flex items-start gap-2">
                                                        {segment.flagged ? (
                                                            <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                                                        ) : (
                                                            <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                                                        )}
                                                        <div className="flex-1">
                                                            <div className="font-mono text-xs text-gray-500 mb-1">
                                                                ID: {segment.id} | Source: {segment.metadata.source}
                                                            </div>
                                                            <div className="text-gray-800">
                                                                {segment.content}
                                                            </div>
                                                            {segment.flagged && (
                                                                <div className="text-xs text-yellow-600 mt-1">
                                                                    Flagged by: {segment.flagReason}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Filtered Segments */}
                                    <div>
                                        <h4 className="font-medium mb-2">Filtered Segments</h4>
                                        <div className="space-y-2 max-h-60 overflow-y-auto">
                                            {testResults.filteredSegments.map((segment: any) => (
                                                <div key={segment.id} className="p-3 border rounded text-sm bg-red-50">
                                                    <div className="flex items-start gap-2">
                                                        <XCircle className="h-4 w-4 text-red-500 mt-0.5" />
                                                        <div className="flex-1">
                                                            <div className="font-mono text-xs text-gray-500 mb-1">
                                                                ID: {segment.id} | Source: {segment.metadata.source}
                                                            </div>
                                                            <div className="text-gray-800">
                                                                {segment.content}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-gray-500">
                                    <p>Click "Test Filtering Rules" to see results</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

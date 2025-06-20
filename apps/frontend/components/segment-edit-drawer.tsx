"use client";

import React, { useState, useEffect } from "react";
import { X, Save, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { documentSegmentApi, DocumentSegment } from "@/lib/api";

interface SegmentEditDrawerProps {
    segment: DocumentSegment | null;
    isOpen: boolean;
    onClose: () => void;
    onSave: (updatedSegment: DocumentSegment) => void;
    onUnsavedChanges: (hasChanges: boolean) => void;
    triggerSave?: boolean;
    onSaveTriggered?: () => void;
}

export interface SegmentEditDrawerHandle {
    save: () => Promise<void>;
}

export default function SegmentEditDrawer({
    segment,
    isOpen,
    onClose,
    onSave,
    onUnsavedChanges,
    triggerSave,
    onSaveTriggered,
}: SegmentEditDrawerProps) {
    const [content, setContent] = useState("");
    const [keywords, setKeywords] = useState<string[]>([]);
    const [newKeyword, setNewKeyword] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // Track original values to detect changes
    const [originalContent, setOriginalContent] = useState("");
    const [originalKeywords, setOriginalKeywords] = useState<string[]>([]);

    // Extract keywords from the keywords object for editing
    const extractKeywordsForEditing = (keywordsObj?: Record<string, unknown>): string[] => {
        if (!keywordsObj) return [];

        // Handle the structure we created in the backend: { extracted: string[], count: number, extractedAt: string }
        if (keywordsObj.extracted && Array.isArray(keywordsObj.extracted)) {
            return keywordsObj.extracted as string[];
        }

        // Fallback for other possible structures
        if (Array.isArray(keywordsObj)) {
            return keywordsObj as string[];
        }

        return [];
    };

    // Convert keywords array back to the expected object format
    const formatKeywordsForSaving = (keywordsArray: string[]): Record<string, unknown> => {
        return {
            extracted: keywordsArray,
            count: keywordsArray.length,
            extractedAt: new Date().toISOString(),
        };
    };

    // Initialize form data when segment changes
    useEffect(() => {
        if (segment) {
            setContent(segment.content || "");
            setKeywords(extractKeywordsForEditing(segment.keywords));
            setNewKeyword("");
            setError(null);
            setSuccess(false);
            setOriginalContent(segment.content || "");
            setOriginalKeywords(extractKeywordsForEditing(segment.keywords));
        }
    }, [segment]);

    // Detect changes and notify parent
    useEffect(() => {
        const contentChanged = content !== originalContent;
        const keywordsChanged = JSON.stringify(keywords.sort()) !== JSON.stringify(originalKeywords.sort());
        const hasChanges = contentChanged || keywordsChanged;

        onUnsavedChanges(hasChanges);
    }, [content, keywords, originalContent, originalKeywords, onUnsavedChanges]);

    // Handle external save trigger
    useEffect(() => {
        if (triggerSave) {
            handleSave();
            onSaveTriggered?.();
        }
    }, [triggerSave]);

    // Add keyword
    const handleAddKeyword = () => {
        const trimmedKeyword = newKeyword.trim();
        if (trimmedKeyword && !keywords.includes(trimmedKeyword)) {
            setKeywords(prev => [...prev, trimmedKeyword]);
            setNewKeyword("");
        }
    };

    // Remove keyword
    const handleRemoveKeyword = (keywordToRemove: string) => {
        setKeywords(prev => prev.filter(keyword => keyword !== keywordToRemove));
    };

    // Handle Enter key in keyword input
    const handleKeywordInputKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddKeyword();
        }
    };

    // Handle save
    const handleSave = async () => {
        if (!segment) return;

        setSaving(true);
        setError(null);
        setSuccess(false);

        try {
            const updateData = {
                content: content.trim(),
                keywords: formatKeywordsForSaving(keywords),
                // Recalculate word count
                wordCount: content.trim().split(/\s+/).length,
            };

            const updatedSegment = await documentSegmentApi.update(segment.id, updateData);
            onSave(updatedSegment);
            setSuccess(true);

            // Auto-close drawer after 1.5 seconds to show success message
            setTimeout(() => {
                onClose();
            }, 1500);
        } catch (err) {
            console.error("Failed to update segment:", err);
            setError("Failed to update segment. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    // Handle close
    const handleClose = () => {
        if (saving) return; // Prevent closing while saving
        onClose();
    };

    if (!isOpen || !segment) return null;

    return (
        <>
            {/* No backdrop - allow full interaction with background */}

            {/* Drawer */}
            <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-40 transform transition-transform border-l border-gray-200">
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">
                                Edit Segment {segment.position}
                            </h2>
                            <p className="text-xs text-gray-600 mt-1">
                                {segment.wordCount} words • {segment.tokens} tokens
                            </p>
                        </div>
                        <button
                            onClick={handleClose}
                            disabled={saving}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                        >
                            <X className="h-4 w-4 text-gray-500" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {/* Error Message */}
                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                <div className="flex">
                                    <div className="flex-shrink-0">
                                        <svg
                                            className="h-4 w-4 text-red-400"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                        >
                                            <path
                                                fillRule="evenodd"
                                                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                                clipRule="evenodd"
                                            />
                                        </svg>
                                    </div>
                                    <div className="ml-2">
                                        <h3 className="text-xs font-medium text-red-800">Error</h3>
                                        <div className="mt-1 text-xs text-red-700">{error}</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Success Message */}
                        {success && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                                <div className="flex">
                                    <div className="flex-shrink-0">
                                        <svg
                                            className="h-4 w-4 text-green-400"
                                            viewBox="0 0 20 20"
                                            fill="currentColor"
                                        >
                                            <path
                                                fillRule="evenodd"
                                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                                clipRule="evenodd"
                                            />
                                        </svg>
                                    </div>
                                    <div className="ml-2">
                                        <h3 className="text-xs font-medium text-green-800">Success</h3>
                                        <div className="mt-1 text-xs text-green-700">Segment updated successfully!</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Content Editor */}
                        <div>
                            <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-2">
                                Content
                            </label>
                            <textarea
                                id="content"
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                rows={22}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-sm"
                                placeholder="Enter segment content..."
                                disabled={saving}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                {content.trim().split(/\s+/).filter(w => w.length > 0).length} words
                            </p>
                        </div>

                        {/* Keywords Editor */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Keywords
                            </label>

                            {/* Existing Keywords as Tags */}
                            <div className="flex flex-wrap gap-2 mb-3">
                                {keywords.map((keyword, index) => (
                                    <span
                                        key={index}
                                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200"
                                    >
                                        {keyword}
                                        <button
                                            onClick={() => handleRemoveKeyword(keyword)}
                                            disabled={saving}
                                            className="ml-1 p-0.5 hover:bg-blue-200 rounded-full transition-colors disabled:opacity-50"
                                            title="Remove keyword"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                                {keywords.length === 0 && (
                                    <span className="text-xs text-gray-500 italic">No keywords added</span>
                                )}
                            </div>

                            {/* Add New Keyword */}
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newKeyword}
                                    onChange={(e) => setNewKeyword(e.target.value)}
                                    onKeyDown={handleKeywordInputKeyDown}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                    placeholder="Add a keyword..."
                                    disabled={saving}
                                />
                                <button
                                    onClick={handleAddKeyword}
                                    disabled={saving || !newKeyword.trim() || keywords.includes(newKeyword.trim())}
                                    className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    title="Add keyword"
                                >
                                    <Plus className="h-4 w-4" />
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                Press Enter or click + to add a keyword
                            </p>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="border-t border-gray-200 p-4 bg-gray-50">
                        <div className="flex items-center justify-end space-x-2">
                            <Button
                                variant="outline"
                                onClick={handleClose}
                                disabled={saving}
                                size="sm"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSave}
                                disabled={saving || !content.trim()}
                                size="sm"
                                className="min-w-[80px]"
                            >
                                {saving ? (
                                    <>
                                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save className="h-3 w-3 mr-1" />
                                        Save
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
} 
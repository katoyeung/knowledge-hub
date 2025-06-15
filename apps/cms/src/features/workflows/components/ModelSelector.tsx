import React, { useState, useEffect } from 'react';
import { Select } from 'antd';
import { useTranslate } from '@refinedev/core';

// Define the structure for the fetched model data
interface OpenRouterModel {
    id: string;
    name: string;
    // Add other properties if needed later
}

// Props for the ModelSelector component
interface ModelSelectorProps {
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ value, onChange, placeholder }) => {
    const [models, setModels] = useState<OpenRouterModel[]>([]);
    const [loading, setLoading] = useState(false);
    const translate = useTranslate();

    useEffect(() => {
        setLoading(true);
        fetch('https://openrouter.ai/api/v1/models')
            .then(response => response.json())
            .then((responseData: { data: OpenRouterModel[] }) => {
                // Access the array from the 'data' property
                const modelsData = responseData.data;
                // Sort models alphabetically by name for better UX
                // Handle cases where modelsData might be null or undefined defensively
                const sortedModels = modelsData ? modelsData.sort((a, b) => a.name.localeCompare(b.name)) : [];
                setModels(sortedModels); // Set the state with the sorted array
            })
            .catch(error => {
                console.error("Error fetching models:", error);
                // TODO: Add user-facing error handling (e.g., notification)
            })
            .finally(() => setLoading(false));
    }, []);

    return (
        <Select
            showSearch
            value={value}
            onChange={onChange}
            loading={loading}
            placeholder={placeholder || translate("workflows.placeholders.selectModel", "Select a model")}
            optionFilterProp="children" // Search based on the rendered content (model name)
            filterOption={(input, option) =>
                (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
            }
            style={{ width: '100%' }}
        >
            {models.map(model => (
                <Select.Option key={model.id} value={model.id}>
                    {model.name}
                </Select.Option>
            ))}
        </Select>
    );
};

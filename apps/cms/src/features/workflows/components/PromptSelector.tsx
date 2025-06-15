import React from 'react';
import { Select } from 'antd';
import { useTranslate, useApiUrl, useCustom } from '@refinedev/core';

// Define the structure for the fetched prompt data
interface InternalPrompt {
    id: string;
    title: string;
    prompt: string;
    // Add other properties if needed later
    // You can add createdAt, updatedAt, createdBy etc. if you need them
}

// Props for the PromptSelector component
interface PromptSelectorProps {
    value?: string;
    onChange?: (promptContent: string) => void;
    placeholder?: string;
}

export const PromptSelector: React.FC<PromptSelectorProps> = ({ value, onChange, placeholder }) => {
    const apiUrl = useApiUrl();
    const translate = useTranslate();
    const { data: promptsData, isLoading, isError } = useCustom<InternalPrompt[]>({
        url: `${apiUrl}/prompts`,
        method: "get",
    });

    const prompts = promptsData?.data || [];

    // Log fetched prompts (optional, can be removed after confirming)
    React.useEffect(() => {
        if (prompts.length > 0) {
            console.log("Fetched prompts:", prompts);
        }
        if (isError) {
            console.error("Error fetching prompts:", promptsData);
        }
    }, [promptsData, prompts, isError]);

    const handleChange = (selectedValue: string, option: any) => {
        console.log("handleChange - selectedValue:", selectedValue);
        console.log("handleChange - selected option:", option); // Check the 'value' prop here
        if (onChange) {
            // selectedValue should now be the prompt content from the 'prompt' field
            onChange(selectedValue);
        }
    };

    return (
        <Select
            showSearch
            value={value}
            onChange={handleChange}
            loading={isLoading}
            placeholder={placeholder || translate("workflows.placeholders.selectPrompt", "Select a prompt template")}
            optionFilterProp="children"
            filterOption={(input, option) =>
                (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
            }
            style={{ width: '100%' }}
        >
            {prompts.map(p => ( // Use 'p' for brevity inside map
                // Pass p.prompt (the actual content) as the value
                <Select.Option key={p.id} value={p.prompt}>
                    {p.title}
                </Select.Option>
            ))}
            {prompts.length === 0 && !isLoading && (
                <Select.Option disabled value="no-prompts">
                    {translate("workflows.prompts.noneFound", "No prompt templates found.")}
                </Select.Option>
            )}
        </Select>
    );
};

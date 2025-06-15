import { Edit, useForm } from "@refinedev/antd";
import { Form, Input, Switch, Radio, Row, Col, Select, InputNumber, Space, Card, Tabs, Alert, Tooltip, Typography, Button } from "antd";
import { useState, useEffect } from "react";
import {
  useTranslate,
  useApiUrl,
  useCustom,
  useNavigation,
} from "@refinedev/core";
import { WorkflowNodesManager } from "../../features/workflows/components/WorkflowNodesManager";
import { InfoCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

// Define the structure of the fetched template data
interface FetchedNodeTemplate {
  id: string;
  name: string;
  type: string; // e.g., "service.fetchNews", "internal_service"
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  parameters: {
    service: string;
    method: string;
    params: string[];
  };
}

// Defin // e.g., { size: "{{initialInput.size}}", hours: "{{initialInput.hours}}" }e the structure expected by the form and handleAddNode
interface FormNodeTemplate {
  key: string; // Use fetched id as key
  name: string;
  type: string; // Use the fetched type directly or map if needed
  parameters: Record<string, any>; // Allow any type for parameters now, validation via schema
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
}

// ScheduleTriggerInput component to replace the simple cron input
const ScheduleTriggerInput = ({ value, onChange }) => {
  const [scheduleType, setScheduleType] = useState(value?.type || 'minutes');

  // Hours for selection
  const hourOptions = Array.from({ length: 24 }, (_, i) => ({
    value: i,
    label: i === 0 ? '12am' : i === 12 ? '12pm' : i < 12 ? `${i}am` : `${i - 12}pm`
  }));

  // Days of week
  const weekdayOptions = [
    { value: 'MON', label: 'Monday' },
    { value: 'TUE', label: 'Tuesday' },
    { value: 'WED', label: 'Wednesday' },
    { value: 'THU', label: 'Thursday' },
    { value: 'FRI', label: 'Friday' },
    { value: 'SAT', label: 'Saturday' },
    { value: 'SUN', label: 'Sunday' }
  ];

  // Generate the cron expression based on the selected options
  const generateCronExpression = (type, options) => {
    switch (type) {
      case 'minutes':
        return `*/${options.minutes || 5} * * * *`;

      case 'hours':
        return `${options.minute || 0} */${options.hours || 1} * * *`;

      case 'days':
        return `${options.minute || 0} ${options.hour || 9} */${options.days || 1} * *`;

      case 'weeks':
        const dayOfWeek = options.dayOfWeek || 'MON';
        const dayNumber = { 'MON': 1, 'TUE': 2, 'WED': 3, 'THU': 4, 'FRI': 5, 'SAT': 6, 'SUN': 0 }[dayOfWeek];
        return `${options.minute || 0} ${options.hour || 9} * * ${dayNumber}`;

      case 'months':
        return `${options.minute || 0} ${options.hour || 9} ${options.dayOfMonth || 1} */${options.months || 1} *`;

      case 'custom':
        return options.cron || '0 * * * *';

      default:
        return '0 * * * *';
    }
  };

  // Handle change of any option
  const handleScheduleChange = (type, options) => {
    const cronExpression = generateCronExpression(type, options);

    onChange({
      type,
      options,
      cron: cronExpression
    });
  };

  // Convert cron to readable text description
  const getCronDescription = (cron) => {
    try {
      // In production you would use the actual cronstrue library here
      // For simplicity, I'm providing some basic translations
      if (cron === '* * * * *') return 'Every minute';
      if (cron === '0 * * * *') return 'Every hour';
      if (cron === '0 9 * * *') return 'Every day at 9:00 AM';
      if (cron === '0 9 * * 1') return 'Every Monday at 9:00 AM';
      if (cron.match(/^\d+ \d+ \* \* \*$/)) return 'Daily';
      if (cron.match(/^\d+ \d+ \* \* [0-6]$/)) return 'Weekly';

      return 'Custom schedule';
    } catch (error) {
      return 'Invalid cron expression';
    }
  };

  // Initialize options from value
  const options = value?.options || {};

  return (
    <Card>
      <Tabs
        activeKey={scheduleType}
        onChange={(newType) => {
          setScheduleType(newType);
          handleScheduleChange(newType, options);
        }}
      >
        <TabPane tab="Minutes" key="minutes">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Form.Item label="Minutes Between Triggers" required>
              <InputNumber
                min={1}
                max={59}
                value={options.minutes || 5}
                onChange={(val) => handleScheduleChange('minutes', { ...options, minutes: val })}
                style={{ width: 200 }}
              />
            </Form.Item>
            <Alert
              message={`Will run every ${options.minutes || 5} minutes`}
              type="info"
              showIcon
            />
          </Space>
        </TabPane>

        <TabPane tab="Hours" key="hours">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Form.Item label="Hours Between Triggers" required>
              <InputNumber
                min={1}
                max={23}
                value={options.hours || 1}
                onChange={(val) => handleScheduleChange('hours', { ...options, hours: val })}
                style={{ width: 200 }}
              />
            </Form.Item>
            <Form.Item label="Trigger at Minute" required>
              <InputNumber
                min={0}
                max={59}
                value={options.minute || 0}
                onChange={(val) => handleScheduleChange('hours', { ...options, minute: val })}
                style={{ width: 200 }}
              />
            </Form.Item>
            <Alert
              message={`Will run every ${options.hours || 1} hour(s) at ${options.minute || 0} minutes past the hour`}
              type="info"
              showIcon
            />
          </Space>
        </TabPane>

        <TabPane tab="Days" key="days">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Form.Item label="Days Between Triggers" required>
              <InputNumber
                min={1}
                max={31}
                value={options.days || 1}
                onChange={(val) => handleScheduleChange('days', { ...options, days: val })}
                style={{ width: 200 }}
              />
            </Form.Item>
            <Form.Item label="Trigger at Hour" required>
              <Select
                value={options.hour || 9}
                onChange={(val) => handleScheduleChange('days', { ...options, hour: val })}
                style={{ width: 200 }}
              >
                {hourOptions.map(hour => (
                  <Option key={hour.value} value={hour.value}>{hour.label}</Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="Trigger at Minute" required>
              <InputNumber
                min={0}
                max={59}
                value={options.minute || 0}
                onChange={(val) => handleScheduleChange('days', { ...options, minute: val })}
                style={{ width: 200 }}
              />
            </Form.Item>
            <Alert
              message={`Will run every ${options.days || 1} day(s) at ${hourOptions.find(h => h.value === (options.hour || 9))?.label || '9am'}:${String(options.minute || 0).padStart(2, '0')}`}
              type="info"
              showIcon
            />
          </Space>
        </TabPane>

        <TabPane tab="Weeks" key="weeks">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Form.Item label="Weeks Between Triggers" required>
              <InputNumber
                min={1}
                max={52}
                value={options.weeks || 1}
                onChange={(val) => handleScheduleChange('weeks', { ...options, weeks: val })}
                style={{ width: 200 }}
              />
            </Form.Item>
            <Form.Item label="Trigger on Weekday" required>
              <Select
                value={options.dayOfWeek || 'MON'}
                onChange={(val) => handleScheduleChange('weeks', { ...options, dayOfWeek: val })}
                style={{ width: 200 }}
              >
                {weekdayOptions.map(day => (
                  <Option key={day.value} value={day.value}>{day.label}</Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="Trigger at Hour" required>
              <Select
                value={options.hour || 9}
                onChange={(val) => handleScheduleChange('weeks', { ...options, hour: val })}
                style={{ width: 200 }}
              >
                {hourOptions.map(hour => (
                  <Option key={hour.value} value={hour.value}>{hour.label}</Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="Trigger at Minute" required>
              <InputNumber
                min={0}
                max={59}
                value={options.minute || 0}
                onChange={(val) => handleScheduleChange('weeks', { ...options, minute: val })}
                style={{ width: 200 }}
              />
            </Form.Item>
            <Alert
              message={`Will run every ${options.weeks || 1} week(s) on ${weekdayOptions.find(d => d.value === (options.dayOfWeek || 'MON'))?.label || 'Monday'} at ${hourOptions.find(h => h.value === (options.hour || 9))?.label || '9am'}:${String(options.minute || 0).padStart(2, '0')}`}
              type="info"
              showIcon
            />
          </Space>
        </TabPane>

        <TabPane tab="Custom" key="custom">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Form.Item
              label="Cron Expression"
              required
              tooltip={{
                title: 'Format: minute hour day-of-month month day-of-week',
                icon: <InfoCircleOutlined />
              }}
            >
              <Input
                value={options.cron || '0 * * * *'}
                onChange={(e) => handleScheduleChange('custom', { ...options, cron: e.target.value })}
                placeholder="e.g., 0 9 * * 1"
                style={{ width: 200 }}
              />
            </Form.Item>
            <Tooltip title="Use https://crontab.guru/ to build cron expressions">
              <Button type="link" icon={<ClockCircleOutlined />} target="_blank" href="https://crontab.guru/">
                Cron Helper
              </Button>
            </Tooltip>
            <Alert
              message={`Will run: ${getCronDescription(options.cron || '0 * * * *')}`}
              type="info"
              showIcon
            />
          </Space>
        </TabPane>
      </Tabs>

      {/* Add form field to store the actual cron expression - can be hidden if needed */}
      <Input
        type="hidden"
        value={generateCronExpression(scheduleType, options)}
      />
    </Card>
  );
};

export const WorkflowEdit = () => {
  const { show } = useNavigation();
  const { formProps, saveButtonProps, queryResult, formLoading } = useForm({
    onMutationSuccess: (data) => {
      if (data.data.id) {
        show("workflows", data.data.id);
      }
    },
    redirect: false,
  });
  const translate = useTranslate();
  const apiUrl = useApiUrl();
  const { data: fetchedTemplatesData, isLoading: isLoadingTemplates } =
    useCustom<FetchedNodeTemplate[]>({
      url: `${apiUrl}/workflow-actions`,
      method: "get",
    });

  const [availableNodeTemplates, setAvailableNodeTemplates] = useState<
    FormNodeTemplate[]
  >([]);
  const [isNodesManagerLoading, setIsNodesManagerLoading] = useState(false);
  const form = formProps.form;

  // Transform fetched data into the structure needed for the form/menu
  useEffect(() => {
    if (fetchedTemplatesData?.data) {
      const transformedTemplates = fetchedTemplatesData.data.map(
        (template) => ({
          key: template.id,
          name: template.name,
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

  const triggerType = Form.useWatch("triggerType", form);

  const onFinish = (values: any) => {
    const finalNodes = values.nodes?.map((node: any, index: number) => {
      const {
        inputSchema,
        outputSchema,
        uniqueKeyForDnd,
        templateKey,
        isMinimized,
        ...nodeToSubmit
      } = node;
      return {
        ...nodeToSubmit,
        position: index + 1,
      };
    });
    formProps.onFinish?.({ ...values, nodes: finalNodes });
  };

  // MODIFIED EFFECT:
  // Effect to add uniqueKeyForDnd, schemas, isMinimized, and templateKey to existing nodes when form data loads
  useEffect(() => {
    if (
      queryResult?.data?.data?.nodes &&
      form &&
      availableNodeTemplates.length > 0
    ) {
      const existingNodesFromAPI = queryResult.data.data.nodes;
      const sortedNodesFromAPI = [...existingNodesFromAPI].sort(
        (a, b) => (a.position || 0) - (b.position || 0)
      );

      const nodesWithEnhancedData = sortedNodesFromAPI.map(
        (apiNode: any, index: number) => {
          const template = availableNodeTemplates.find(
            (t) => t.type === apiNode.type || t.key === apiNode.templateKey
          );
          return {
            ...apiNode,
            inputSchema:
              apiNode.inputSchema ||
              (template ? template.inputSchema : { properties: {} }),
            outputSchema:
              apiNode.outputSchema || (template ? template.outputSchema : {}),
            uniqueKeyForDnd:
              apiNode.uniqueKeyForDnd ||
              apiNode.id ||
              `existing_${index}_${Date.now()}`,
            isMinimized: apiNode.isMinimized ?? false,
            templateKey:
              apiNode.templateKey || (template ? template.key : undefined),
          };
        }
      );
      form.setFieldsValue({ nodes: nodesWithEnhancedData });
    }
  }, [queryResult?.data?.data?.nodes, form, availableNodeTemplates]);

  return (
    <Edit
      saveButtonProps={{
        ...saveButtonProps,
        loading: isLoadingTemplates || formLoading || isNodesManagerLoading,
      }}
      isLoading={formLoading}
    >
      <Form {...formProps} layout="vertical" onFinish={onFinish}>
        <Row gutter={16}>
          <Col span={18}>
            <Form.Item
              label={translate("workflows.fields.name", "Name")}
              name={["name"]}
              rules={[
                {
                  required: true,
                },
              ]}
            >
              <Input />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item
              label={translate("workflows.fields.status", "Status")}
              name={["status"]}
              valuePropName="checked"
              getValueFromEvent={(eventValue: boolean) =>
                eventValue ? "active" : "inactive"
              }
              getValueProps={(value: string) => ({
                checked: value === "active",
              })}
            >
              <Switch
                checkedChildren={translate(
                  "workflows.statusTexts.active",
                  "Active"
                )}
                unCheckedChildren={translate(
                  "workflows.statusTexts.inactive",
                  "Inactive"
                )}
              />
            </Form.Item>
          </Col>
        </Row>
        {/* Replace Description with Status, Trigger Type, and Cron like in create.tsx */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label={translate("workflows.fields.triggerType", "Trigger Type")}
              name={["triggerType"]}
              rules={[{ required: true }]}
            >
              <Radio.Group>
                <Radio.Button value="schedule">Schedule</Radio.Button>
                <Radio.Button value="manual">Manual</Radio.Button>
              </Radio.Group>
            </Form.Item>
          </Col>
        </Row>

        {triggerType === "schedule" && (
          <Form.Item
            label={translate("workflows.fields.schedule", "Schedule")}
            name={["triggerConfig"]}
            rules={[{ required: true }]}
          >
            <ScheduleTriggerInput />
          </Form.Item>
        )}

        {form && (
          <WorkflowNodesManager
            form={form}
            translate={translate}
            apiUrl={apiUrl}
            formListName="nodes"
            onLoadingStatusChange={setIsNodesManagerLoading}
          />
        )}
      </Form>
    </Edit>
  );
};

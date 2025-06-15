import { useState } from "react";
import { Create, useForm } from "@refinedev/antd";
import { Form, Input, Switch, Radio, Row, Col } from "antd";

import { useTranslate, useApiUrl } from "@refinedev/core";
import { WorkflowNodesManager } from "../../features/workflows/components/WorkflowNodesManager";


export const WorkflowCreate = () => {
  const translate = useTranslate();
  const { formProps, saveButtonProps, form } = useForm({});
  const apiUrl = useApiUrl(); // Get API base URL
  const [isNodesManagerLoading, setIsNodesManagerLoading] = useState(false);

  const triggerType = Form.useWatch("triggerType", form);

  // Modify save behavior to inject positions and clean up nodes
  const onFinish = (values: any) => {
    // 1. Map nodes to add position and remove unwanted fields
    const finalNodes = values.nodes?.map((node: any, index: number) => {
      // Destructure to exclude fields we don't want to submit
      const { inputSchema, outputSchema, uniqueKeyForDnd, templateKey, ...nodeToSubmit } = node;
      return {
        ...nodeToSubmit, // Keep name, type, parameters
        position: index + 1, // Add position
      };
    });

    // 2. Use the cleaned nodes for submission
    formProps.onFinish?.({ ...values, nodes: finalNodes });
  };

  return (
    // Pass isLoadingTemplates to the Create component's save button
    <Create saveButtonProps={{ ...saveButtonProps, form: undefined, loading: isNodesManagerLoading }}>
      <Form {...formProps} form={form} layout="vertical" onFinish={onFinish}>
        {/* Basic Workflow Details */}
        <Form.Item
          label={translate("workflows.fields.name", "Name")}
          name={["name"]}
          rules={[{ required: true }]}
        >
          <Input />
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label={translate("workflows.fields.status", "Status")}
              name={["status"]}
              initialValue="active"
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
          <Col span={12}>
            <Form.Item
              label={translate("workflows.fields.triggerType", "Trigger Type")}
              name={["triggerType"]}
              rules={[{ required: true }]}
              initialValue="manual" // Optional: set a default for radio group
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
            label={translate("workflows.fields.cron", "Cron Expression")}
            name={["triggerConfig", "cron"]}
            rules={[{ required: true }]} // Add cron validation rule if needed
          >
            <Input placeholder="e.g., 0 * * * *" />
          </Form.Item>
        )}
        {/* End Basic Workflow Details */}

        {/* Integrate the WorkflowNodesManager component */}
        <WorkflowNodesManager
          form={form}
          translate={translate}
          apiUrl={apiUrl}
          formListName="nodes"
          onLoadingStatusChange={setIsNodesManagerLoading}
        />
      </Form>
    </Create>
  );
};

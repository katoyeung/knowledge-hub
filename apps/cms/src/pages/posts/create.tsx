import { Create, useForm } from "@refinedev/antd";
import { Form, Input, Tabs } from "antd";
import TextArea from "antd/es/input/TextArea";

export const PostCreate = () => {
  const { formProps, saveButtonProps } = useForm({});

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Tabs defaultActiveKey="1">
          <Tabs.TabPane tab="Basic Info" key="1">
            <Form.Item
              label="Type"
              name={["type"]}
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label="Source"
              name={["source"]}
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label="URL"
              name={["url"]}
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label="Hash"
              name={["hash"]}
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label="Title"
              name={["title"]}
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label="Posted At"
              name={["postedAt"]}
              rules={[{ required: true }]}
            >
              <Input type="datetime-local" />
            </Form.Item>
          </Tabs.TabPane>
          <Tabs.TabPane tab="Content" key="2">
            <Form.Item
              label="Content"
              name={["content"]}
              rules={[{ required: true }]}
            >
              <TextArea rows={10} />
            </Form.Item>
          </Tabs.TabPane>
          <Tabs.TabPane tab="Metadata" key="3">
            <Form.Item
              label="Metadata"
              name={["metadata"]}
              rules={[{ required: true }]}
              getValueProps={(value) => ({
                value: typeof value === "string" ? value : JSON.stringify(value, null, 2),
              })}
              getValueFromEvent={(e) => {
                try {
                  return JSON.parse(e.target.value);
                } catch (error) {
                  return e.target.value;
                }
              }}
            >
              <TextArea rows={10} />
            </Form.Item>
          </Tabs.TabPane>
        </Tabs>
      </Form>
    </Create>
  );
};

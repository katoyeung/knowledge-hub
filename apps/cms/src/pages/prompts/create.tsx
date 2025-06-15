import { Create, useForm } from "@refinedev/antd";
import { Form, Input } from "antd";

export const PromptCreate = () => {
  const { formProps, saveButtonProps } = useForm({});

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item
          label="Title"
          name={["title"]}
          rules={[{ required: true }]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          label="Prompt"
          name={["prompt"]}
          rules={[{ required: true }]}
        >
          <Input.TextArea rows={20} />
        </Form.Item>
      </Form>
    </Create>
  );
};

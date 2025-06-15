import { Create, useForm } from "@refinedev/antd";
import { Form, Input, Select } from "antd";

export const PermissionCreate = () => {
  const { formProps, saveButtonProps } = useForm({});

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item
          label={"Resource"}
          name={["resource"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          label="Action"
          name={["action"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Select>
            <Select.Option value="view">view</Select.Option>
            <Select.Option value="edit">edit</Select.Option>
            <Select.Option value="delete">delete</Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </Create>
  );
};

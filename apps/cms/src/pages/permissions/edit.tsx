import { Edit, useForm } from "@refinedev/antd";
import { Form, Input, Select } from "antd";

export const PermissionEdit = () => {
  const { formProps, saveButtonProps, formLoading } = useForm({});

  return (
    <Edit saveButtonProps={saveButtonProps} isLoading={formLoading}>
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
    </Edit>
  );
};

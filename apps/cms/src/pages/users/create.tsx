import { Create, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, Select } from "antd";

export const UserCreate = () => {
  const { formProps, saveButtonProps } = useForm({});

  const { selectProps: roleSelectProps } = useSelect({
    resource: "roles",
    optionLabel: "name",
    optionValue: "id",
  });

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item
          label={"Name"}
          name={["name"]}
          rules={[
            {
              required: true,
            },
          ]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          label={"Email"}
          name={["email"]}
          rules={[
            {
              required: true,
            },
            {
              type: 'email',
              message: 'Please enter a valid email address!',
            },
          ]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          label={"Password"}
          name={["password"]}
          rules={[
            {
              required: true,
            },
            {
              min: 8,
              message: 'Password must be at least 8 characters long',
            },
          ]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          label={"Roles"}
          name={["roles"]}
          rules={[
            {
              required: true,
              type: 'array',
              message: 'Please select at least one role',
            },
          ]}
        >
          <Select {...roleSelectProps} mode="multiple" />
        </Form.Item>
      </Form>
    </Create>
  );
};

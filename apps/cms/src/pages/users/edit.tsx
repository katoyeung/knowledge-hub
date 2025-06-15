import { Edit, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, Select } from "antd";
import { useEffect } from "react";

export const UserEdit = () => {
  const { formProps, saveButtonProps, formLoading, form } = useForm({});
  const { selectProps: roleSelectProps } = useSelect({
    resource: "roles",
    optionLabel: "name",
    optionValue: "id",
  });
  const roles = form.getFieldValue("roles");

  useEffect(() => {
    if (!roles) {
      let attempts = 0;
      const intervalId = setInterval(() => {
        if (attempts >= 10) {
          clearInterval(intervalId);
          return;
        }
        form.resetFields(['roles']);
        attempts++;
      }, 1000);
      return () => clearInterval(intervalId);
    }

    if (roles && Array.isArray(roles) && roles.every(role => typeof role === 'object')) {
      const roleIds = roles.map((role) => role.id);
      form.setFieldsValue({ roles: roleIds });
    }
  }, [roles, form]);

  return (
    <Edit saveButtonProps={saveButtonProps} isLoading={formLoading}>
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
          <Select {...roleSelectProps} mode="multiple" allowClear />
        </Form.Item>
      </Form>
    </Edit>
  );
};

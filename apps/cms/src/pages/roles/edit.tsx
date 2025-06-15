import { Edit, useForm } from "@refinedev/antd";
import { Form, Input } from "antd";

import { useEffect, useState } from "react";
import { Permission } from "./permission.interface";
import { PermissionsTable } from "./create";

export const RoleEdit = () => {
  const { form, formProps, saveButtonProps, formLoading } = useForm({});
  const [permissionIds, setPermissionIds] = useState<number[]>([]);

  useEffect(() => {
    const permissions = form.getFieldValue('permissions');
    if (permissions && Array.isArray(permissions) && permissions.some((p: any) => typeof p === 'object' && 'id' in p)) {
      const ids = permissions.map((p: Permission) => p.id);

      setPermissionIds(ids);
      form.setFieldsValue({ permissions: ids });
    }
  }, [form, formLoading]);

  const handlePermissionsChange = (value: number[]) => {
    setPermissionIds(value);
    form.setFieldsValue({ permissions: value });
  };

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
          name="permissions"
          style={{ display: 'none' }}
        >
          <Input type="hidden" />
        </Form.Item>

        <Form.Item
          label="Permissions"
        >
          <PermissionsTable
            value={permissionIds}
            onChange={handlePermissionsChange}
          />
        </Form.Item>
      </Form>
    </Edit>
  );
};

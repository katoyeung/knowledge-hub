import { Create, useForm, useSelect } from "@refinedev/antd";
import { Form, Table, Checkbox, Input } from "antd";
import { useState, useEffect } from "react";
import { Permission } from "./permission.interface";

export const PermissionsTable = ({ value = [], onChange }: { value: number[], onChange: (value: number[]) => void }) => {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const { selectProps: { options: permissionsData } = {} } = useSelect<Permission>({
    resource: "permissions",
    optionLabel: (item) => `${item.resource}|${item.action}`,
    optionValue: (item) => item.id.toString(),
    filters: [
      {
        field: '_start',
        operator: 'eq',
        value: 0
      },
      {
        field: '_end',
        operator: 'eq',
        value: 9999
      }
    ]
  });

  useEffect(() => {
    if (permissionsData) {
      const allPermissions = permissionsData.map(p => {
        if (typeof p.label !== 'string') {
          return { id: Number(p.value), action: 'unknown', resource: 'unknown' };
        }
        const [resource, action] = p.label.split('|');
        return {
          id: Number(p.value),
          action: action || 'unknown',
          resource: resource || 'unknown'
        };
      });
      setPermissions(allPermissions);
    }
  }, [permissionsData]);

  const resources = [...new Set(permissions.map(p => p.resource))];
  const actions = ["view", "edit", "delete"];

  const columns = [
    { title: "Resource", dataIndex: "resource" },
    {
      title: "All",
      dataIndex: "all",
      render: (_: any, record: { resource: string }) => {
        const resourcePermissions = permissions.filter(p => p.resource === record.resource);
        const allChecked = resourcePermissions.every(p => value.includes(p.id));
        const someChecked = resourcePermissions.some(p => value.includes(p.id));

        return (
          <Checkbox
            indeterminate={someChecked && !allChecked}
            checked={allChecked}
            onChange={(e) => {
              const newValue = e.target.checked
                ? [...value, ...resourcePermissions.map(p => p.id)]
                : value.filter(v => !resourcePermissions.map(p => p.id).includes(v));
              onChange(newValue);
            }}
          />
        );
      },
    },
    ...actions.map(action => ({
      title: action.charAt(0).toUpperCase() + action.slice(1),
      dataIndex: action,
      render: (_: any, record: { resource: string }) => {
        const permission = permissions.find(p => p.resource === record.resource && p.action === action);
        const isChecked = permission ? value.includes(permission.id) : false;
        return (
          <Checkbox
            checked={isChecked}
            onChange={(e) => {
              if (permission) {
                const newValue = e.target.checked
                  ? [...value, permission.id]
                  : value.filter(v => v !== permission.id);
                onChange(newValue);
              }
            }}
            disabled={!permission}
          />
        );
      },
    })),
  ];

  const dataSource = resources.map(resource => ({
    key: resource,
    resource,
  }));

  return <Table columns={columns} dataSource={dataSource} pagination={false} />;
};

export const RoleCreate = () => {
  const { form, formProps, saveButtonProps } = useForm({});

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item
          label="Name"
          name={["name"]}
          rules={[{ required: true }]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          label="Permissions"
          name="permissions"
          rules={[{ required: true }]}
        >
          <PermissionsTable
            value={form.getFieldValue("permissions") || []}
            onChange={(value) => {
              form.setFieldsValue({ permissions: value });
            }}
          />
        </Form.Item>
      </Form>
    </Create>
  );
};

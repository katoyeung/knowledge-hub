import {
  DeleteButton,
  EditButton,
  List,
  ShowButton,
  useTable,
} from "@refinedev/antd";
import { type BaseRecord } from "@refinedev/core";
import { Space, Table, Tooltip } from "antd";

export const RoleList = () => {
  const { tableProps } = useTable({
    syncWithLocation: true,
  });

  return (
    <List>
      <Table {...tableProps} rowKey="id">
        <Table.Column dataIndex="id" title={"ID"} />
        <Table.Column dataIndex="name" title={"Name"} />
        <Table.Column
          dataIndex="permissions"
          title="Permissions"
          render={(permissions: any[]) => {
            const resources = [...new Set(permissions.map(p => p.resource))];
            const displayResources = resources.slice(0, 5);
            const remainingCount = resources.length - 5;

            return (
              <span>
                {displayResources.join(', ')}
                {remainingCount > 0 && (
                  <Tooltip title={resources.slice(5).join(', ')}>
                    <span> ... ({remainingCount} more)</span>
                  </Tooltip>
                )}
              </span>
            );
          }}
        />
        <Table.Column
          title={"Actions"}
          dataIndex="actions"
          render={(_, record: BaseRecord) => (
            <Space>
              <EditButton hideText size="small" recordItemId={record.id} />
              <ShowButton hideText size="small" recordItemId={record.id} />
              <DeleteButton hideText size="small" recordItemId={record.id} />
            </Space>
          )}
        />
      </Table>
    </List>
  );
};

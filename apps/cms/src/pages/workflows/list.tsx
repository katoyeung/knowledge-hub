import {
  DeleteButton,
  EditButton,
  List,
  ShowButton,
  TagField,
  useTable,
  DateField,
} from "@refinedev/antd";
import { type BaseRecord, useNavigation } from "@refinedev/core";
import { Space, Table, Button, notification, Tooltip } from "antd";
import axiosInstance from "../../utils/axiosInstance";
import { CopyOutlined } from "@ant-design/icons";
import cronstrue from 'cronstrue';

export const WorkflowList = () => {
  const { tableProps, tableQueryResult: { refetch } } = useTable({
    syncWithLocation: true,
  });
  const { show } = useNavigation();

  const handleDuplicate = async (id: string | number) => {
    try {
      await axiosInstance.post(`/workflows/${id}/duplicate`, {});

      refetch();

      notification.success({
        message: "Workflow duplicated successfully!",
        description: "Success",
        type: "success",
      });
    } catch (error) {
      console.error("Error duplicating workflow:", error);
      notification.error({
        message: "Failed to duplicate workflow.",
        description: error?.message || "Error",
        type: "error",
      });
    }
  };

  // Function to get human-readable cron description
  const getCronDescription = (cron) => {
    try {
      return cronstrue.toString(cron);
    } catch (error) {
      console.error("Error parsing cron expression:", error);
      return cron; // Return the original expression if parsing fails
    }
  };

  return (
    <List>
      <Table
        {...tableProps}
        rowKey="id"
        onRow={(record: BaseRecord) => {
          return {
            onClick: () => {
              show("workflows", record.id);
            },
            style: { cursor: "pointer" },
          };
        }}
      >
        <Table.Column dataIndex="name" title={"Name"} />
        <Table.Column
          dataIndex="status"
          title={"Status"}
          render={(status) => <TagField value={status} color={status === 'active' ? 'green' : 'volcano'} />}
        />
        <Table.Column
          dataIndex="triggerType"
          title={"Trigger Type"}
          render={(triggerType, record: BaseRecord) => (
            triggerType === 'schedule' && record.triggerConfig?.cron ? (
              <Tooltip title={`${record.triggerConfig.cron} (${getCronDescription(record.triggerConfig.cron)})`}>
                <TagField
                  value={triggerType}
                  color={triggerType === 'schedule' ? 'blue' :
                    triggerType === 'manual' ? 'purple' : 'default'}
                />
              </Tooltip>
            ) : (
              <TagField
                value={triggerType}
                color={triggerType === 'schedule' ? 'blue' :
                  triggerType === 'manual' ? 'purple' : 'default'}
              />
            )
          )}
        />
        <Table.Column
          dataIndex="updatedAt"
          title={"Last Update"}
          render={(value) => <DateField value={value} format="YYYY-MM-DD HH:mm:ss" />}
        />
        <Table.Column
          title={"Actions"}
          dataIndex="actions"
          render={(_, record: BaseRecord) => (
            <Space onClick={(e) => e.stopPropagation()}>
              <EditButton hideText size="small" recordItemId={record.id} />
              <ShowButton hideText size="small" recordItemId={record.id} />
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() => handleDuplicate(record.id)}
              />
              <DeleteButton hideText size="small" recordItemId={record.id} />
            </Space>
          )}
        />
      </Table>
    </List >
  );
};

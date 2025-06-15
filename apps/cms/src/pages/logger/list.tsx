import { List, useTable } from "@refinedev/antd";
import { Table, Tooltip, Drawer, Typography } from "antd";
import { useState } from "react";
import ReactJson from 'react-json-view';

const { Text } = Typography;

export const LoggerList = () => {
  const { tableProps } = useTable({
    syncWithLocation: true,
  });
  const [selectedRecord, setSelectedRecord] = useState<any>(null);

  const handleRowClick = (record: any) => {
    setSelectedRecord(record);
  };

  const handleCloseDrawer = () => {
    setSelectedRecord(null);
  };

  // Helper function to get a preview of metadata
  const getMetadataPreview = (metadata: any) => {
    if (!metadata) return '';
    const preview = Object.entries(metadata)
      .map(([key, value]) => {
        if (typeof value === 'string') {
          return `${key}: ${value.substring(0, 30)}...`;
        }
        if (typeof value === 'object' && value !== null) {
          return `${key}: {...}`;
        }
        return `${key}: ${value}`;
      })
      .join(', ');
    return preview.length > 100 ? preview.substring(0, 100) + '...' : preview;
  };

  return (
    <>
      <List>
        <Table
          {...tableProps}
          rowKey="id"
          scroll={{ x: 1500 }}
          onRow={(record) => ({
            onClick: () => handleRowClick(record),
            style: { cursor: 'pointer' }
          })}
        >
          <Table.Column dataIndex="id" title="ID" />
          <Table.Column dataIndex="type" title="Type" />
          <Table.Column dataIndex="message" title="Message" />
          <Table.Column
            dataIndex="metadata"
            title="Metadata Preview"
            render={(metadata) => (
              <Tooltip title="Click to view full details">
                <Text ellipsis>{getMetadataPreview(metadata)}</Text>
              </Tooltip>
            )}
          />
          <Table.Column
            dataIndex="createdAt"
            title="Created At"
            render={(date) => new Date(date).toLocaleString()}
          />
        </Table>
      </List>

      <Drawer
        title="Log Details"
        placement="right"
        onClose={handleCloseDrawer}
        open={!!selectedRecord}
        width={800}
      >
        {selectedRecord?.metadata && (
          <div style={{ padding: '16px' }}>
            <ReactJson
              src={selectedRecord.metadata}
              theme="rjv-default"
              name={false}
              collapsed={2}
              enableClipboard={true}
              displayDataTypes={false}
              style={{
                fontSize: '14px',
                backgroundColor: 'transparent',
              }}
            />
          </div>
        )}
      </Drawer>
    </>
  );
};

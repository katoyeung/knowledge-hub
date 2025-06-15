import { AlertOutlined } from "@ant-design/icons";
import {
  DateField,
  DeleteButton,
  List,
  ShowButton,
  useTable,
  useDrawerForm,
  SaveButton,
} from "@refinedev/antd";
import { type BaseRecord } from "@refinedev/core";
import { Button, Space, Table, Tooltip, Drawer, Form, Input } from "antd";
import { useState } from "react";
import { PostAnalyze } from "./analyze";

export const PostList = () => {
  const { tableProps } = useTable({
    syncWithLocation: true,
  });

  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<BaseRecord | null>(
    null,
  );
  const [dataLoading, setDataLoading] = useState(false);

  const {
    drawerProps,
    formProps,
    show,
    saveButtonProps,
  } = useDrawerForm<BaseRecord>({
    action: "edit",
  });

  return (
    <>
      <List>
        <Table
          {...tableProps}
          rowKey="id"
          scroll={{ x: 1500 }}
          onRow={(record: BaseRecord) => {
            return {
              onClick: () => {
                show(record.id);
              },
              style: { cursor: "pointer" },
            };
          }}
        >
          <Table.Column dataIndex="id" title="ID" />
          <Table.Column dataIndex="type" title="Type" />
          <Table.Column dataIndex="source" title="Source" />
          <Table.Column
            dataIndex="url"
            title="URL"
            ellipsis={{
              showTitle: false,
            }}
            render={(url) => (
              <Tooltip title={url}>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {url}
                </a>
              </Tooltip>
            )}
          />
          <Table.Column
            dataIndex="title"
            title="Title"
          />
          <Table.Column
            dataIndex="content"
            title="Content"
            ellipsis={{
              showTitle: false,
            }}
            render={(content) => (
              <Tooltip title={content}>
                <span>{content}</span>
              </Tooltip>
            )}
          />
          <Table.Column
            dataIndex={["postedAt"]}
            title="Posted At"
            render={(value) => (
              <DateField value={value} format="YYYY-MM-DD HH:mm" />
            )}
          />
          <Table.Column
            dataIndex="metadata"
            title="Metadata"
            render={(metadata) => (
              <Tooltip
                title={<pre>{JSON.stringify(metadata, null, 2)}</pre>}
                overlayStyle={{ maxWidth: "800px" }}
              >
                <span>{metadata ? JSON.stringify(metadata).substring(0, 50) + '...' : '-'}</span>
              </Tooltip>
            )}
          />
          <Table.Column
            dataIndex={["createdAt"]}
            title="Created At"
            render={(value) => (
              <DateField value={value} format="YYYY-MM-DD HH:mm" />
            )}
          />
          <Table.Column
            dataIndex={["updatedAt"]}
            title="Updated At"
            render={(value) => (
              <DateField value={value} format="YYYY-MM-DD HH:mm" />
            )}
          />
          <Table.Column
            title="Actions"
            dataIndex="actions"
            fixed="right"
            render={(_, record: BaseRecord) => (
              <Space onClick={(e) => e.stopPropagation()}>
                <ShowButton hideText size="small" recordItemId={record.id} />
                <Button
                  onClick={() => {
                    setAnalyzeOpen(!analyzeOpen);
                    setSelectedRecord(record as any);
                  }}
                  style={{
                    cursor: "pointer",
                    width: "27px",
                    padding: "0px",
                    height: "24px",
                    borderRadius: "4px",
                  }}
                  loading={dataLoading}
                >
                  <AlertOutlined />
                </Button>
                <DeleteButton hideText size="small" recordItemId={record.id} />
              </Space>
            )}
          />
        </Table>
      </List>
      {analyzeOpen && (
        <PostAnalyze
          open={analyzeOpen}
          onClose={() => {
            setAnalyzeOpen(false);
          }}
          record={selectedRecord}
        />
      )}
      <Drawer {...drawerProps} width={720}>
        <div style={{ textAlign: "right", marginBottom: "10px" }}>
          <SaveButton {...saveButtonProps} />
        </div>
        <Form {...formProps} layout="vertical">
          <Form.Item
            label={"Title"}
            name={"title"}
            rules={[
              {
                required: true,
              },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label={"Content"}
            name={"content"}
            rules={[
              {
                required: true,
              },
            ]}
          >
            <Input.TextArea rows={8} />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
};

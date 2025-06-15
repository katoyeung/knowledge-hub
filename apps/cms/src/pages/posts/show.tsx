import { DateField, MarkdownField, Show, TextField } from "@refinedev/antd";
import { useShow } from "@refinedev/core";
import { Card, Tabs, Typography } from "antd";
import ReactJson from "react-json-view";

const { Title } = Typography;

export const PostShow = () => {
  const { query: { data, isLoading } } = useShow();

  const record = data?.data;

  return (
    <Show isLoading={isLoading}>
      <Tabs defaultActiveKey="1">
        <Tabs.TabPane tab="Basic Info" key="1">
          <Title level={5}>ID</Title>
          <TextField value={record?.id} />

          <Title level={5}>Type</Title>
          <TextField value={record?.type} />

          <Title level={5}>Source</Title>
          <TextField value={record?.source} />

          <Title level={5}>URL</Title>
          <TextField value={record?.url} />

          <Title level={5}>Hash</Title>
          <TextField value={record?.hash} />

          <Title level={5}>Title</Title>
          <TextField value={record?.title} />

          <Title level={5}>Created At</Title>
          <DateField value={record?.createdAt} format="YYYY-MM-DD HH:mm:ss" />

          <Title level={5}>Updated At</Title>
          <DateField value={record?.updatedAt} format="YYYY-MM-DD HH:mm:ss" />
        </Tabs.TabPane>

        <Tabs.TabPane tab="Content" key="2">
          <Card>
            <MarkdownField value={record?.content} />
          </Card>
        </Tabs.TabPane>

        <Tabs.TabPane tab="Metadata" key="3">
          <Card>
            {record?.metadata && (
              <ReactJson
                src={record.metadata}
                name={null}
                theme="rjv-default"
                displayDataTypes={false}
                enableClipboard={false}
                collapsed={1}
              />
            )}
          </Card>
        </Tabs.TabPane>
      </Tabs>
    </Show>
  );
};

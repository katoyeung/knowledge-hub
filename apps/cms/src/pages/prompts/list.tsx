import {
  DeleteButton,
  List,
  SaveButton,
  useDrawerForm,
  useTable,
} from "@refinedev/antd";
import { type BaseRecord } from "@refinedev/core";
import { Space, Table, Drawer, Form, Input } from "antd";


export const PromptList = () => {
  const { tableProps } = useTable({
    syncWithLocation: true,
  });

  const {
    drawerProps,
    formProps,
    show,
    saveButtonProps,
  } = useDrawerForm({
    action: "edit", // Specify the action as 'edit'
  });

  return (
    <>
      <List>
        <Table
          {...tableProps}
          rowKey="id"
          onRow={(record: BaseRecord) => {
            return {
              onClick: () => {
                show(record.id);
              },
              style: { cursor: "pointer" },
            };
          }}
        >
          <Table.Column dataIndex="title" title={"Title"} />
          <Table.Column
            dataIndex="prompt"
            title="Prompt"
            render={(text: string) => (
              <span>{text?.slice(0, 100)}{text?.length > 100 ? '...' : ''}</span>
            )}
          />
          <Table.Column
            title={"Actions"}
            dataIndex="actions"
            render={(_, record: BaseRecord) => (
              <Space onClick={(e) => e.stopPropagation()}>
                <DeleteButton hideText size="small" recordItemId={record.id} />
              </Space>
            )}
          />
        </Table>
      </List>
      <Drawer {...drawerProps} width={720}>
        <div style={{ textAlign: 'right', marginBottom: '10px' }}>
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
            label={"Prompt"}
            name={"prompt"}
            rules={[
              {
                required: true,
              },
            ]}
          >
            <Input.TextArea rows={25} />
          </Form.Item>
        </Form>

      </Drawer>
    </>
  );
};

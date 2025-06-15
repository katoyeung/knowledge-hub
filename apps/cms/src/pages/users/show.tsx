import { DateField, MarkdownField, Show, TextField } from "@refinedev/antd";
import { useShow } from "@refinedev/core";
import { Typography } from "antd";

const { Title } = Typography;

export const UserShow = () => {
  const { query: { data, isLoading } } = useShow();

  const record = data?.data;

  return (
    <Show isLoading={isLoading}>
      <Title level={5}>{"ID"}</Title>
      <TextField value={record?.id} />
      <Title level={5}>{"Name"}</Title>
      <TextField value={record?.name} />
      <Title level={5}>{"Email"}</Title>
      <MarkdownField value={record?.email} />
      <Title level={5}>{"Created At"}</Title>
      <DateField value={record?.createdAt} />
    </Show>
  );
};

import { Show, TextField } from "@refinedev/antd";
import { useShow } from "@refinedev/core";
import { Typography } from "antd";

const { Title } = Typography;

export const PermissionShow = () => {
  const { query: { data, isLoading } } = useShow();

  const record = data?.data;

  return (
    <Show isLoading={isLoading}>
      <Title level={5}>{"ID"}</Title>
      <TextField value={record?.id} />
      <Title level={5}>{"Resource"}</Title>
      <TextField value={record?.resource} />
      <Title level={5}>{"Action"}</Title>
      <TextField value={record?.action} />
    </Show>
  );
};

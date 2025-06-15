/* eslint-disable @typescript-eslint/no-explicit-any */
import { EditOutlined } from "@ant-design/icons";
import { DateField, MarkdownField, Show, TextField } from "@refinedev/antd";
import { useShow } from "@refinedev/core";
import {
  Button,
  Card,
  Drawer,
  Input,
  Modal,
  Select,
  Tabs,
  Typography,
} from "antd";
import ReactJson from "react-json-view";
import { getModelList } from "../../utils/models";
import { useEffect, useState } from "react";
import axios from "axios";
import { apiUrl } from "../../appConfig";
import axiosInstance from "../../utils/axiosInstance";
import { TOKEN_KEY, USER_KEY } from "../../authProvider";
import TextArea from "antd/es/input/TextArea";

interface User {
  id: string;
  // add other user properties as needed
}

interface EditPromptProps {
  open: boolean;
  onClose: () => void;
  promptData: { id: string; title: string; prompt: string };
  setSelectedPrompt: (prompt: any) => void;
  defaultPrompt: any;
}

export const EditPrompt = ({
  open,
  onClose,
  promptData,
  setSelectedPrompt,
  defaultPrompt,
}: EditPromptProps) => {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    if (promptData?.id) {
      setTitle(promptData?.title);
      setPrompt(promptData?.prompt);
    }
  }, [promptData?.id]);

  const createPrompt = () => {
    const token = localStorage.getItem(TOKEN_KEY);
    const userStr = localStorage.getItem(USER_KEY);
    let user: User | null = null;
    if (userStr) {
      user = JSON.parse(userStr) as User;
    }
    if (user?.id && prompt && title) {
      console.log("I am getting called", title, prompt, user?.id);
      const data = JSON.stringify({
        title: title,
        prompt: prompt,
        userId: user?.id,
      });

      const config = {
        method: "post",
        maxBodyLength: Infinity,
        url: `${apiUrl}/prompts`,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        data: data,
      };

      axios
        .request(config)
        .then((response) => {
          console.log("Prompt created", response);
          if (response?.data) {
            setSelectedPrompt(response?.data);
            onClose();
          }
        })
        .catch((error) => {
          console.log(error);
        });
    }
  };

  const editPrompt = () => {
    const token = localStorage.getItem(TOKEN_KEY);
    const userStr = localStorage.getItem(USER_KEY);
    let user: User | null = null;
    if (userStr) {
      user = JSON.parse(userStr) as User;
    }
    if (user?.id && prompt && title) {
      console.log("I am getting called", title, prompt, user?.id);
      const data = JSON.stringify({
        title: title,
        prompt: prompt,
        userId: user?.id,
      });

      const config = {
        method: "put",
        maxBodyLength: Infinity,
        url: `${apiUrl}/prompts/${promptData?.id}`,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        data: data,
      };

      axios
        .request(config)
        .then((response) => {
          console.log("Prompt created", response);
          if (response?.data) {
            setSelectedPrompt(response?.data);
            onClose();
          }
        })
        .catch((error) => {
          console.log(error);
        });
    }
  };

  const deletePrompt = () => {
    const token = localStorage.getItem(TOKEN_KEY);

    if (promptData?.id) {
      console.log("I am getting called", promptData?.id);

      const config = {
        method: "delete",
        maxBodyLength: Infinity,
        url: `${apiUrl}/prompts/${promptData?.id}`,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      };

      axios
        .request(config)
        .then((response) => {
          console.log("Prompt created", response);
          setSelectedPrompt(defaultPrompt);
          onClose();
        })
        .catch((error) => {
          console.log(error);
        });
    }
  };

  return (
    <Modal
      title="Edit Prompt"
      open={open}
      style={{ top: 20 }}
      //   onOk={() => {}}
      onCancel={onClose}
      width="80%"
      height="90%"
      footer={[
        <Button key="back" onClick={onClose}>
          Cancel
        </Button>,
        <Button
          key="submit"
          color="danger"
          disabled={promptData?.id === "default"}
          variant="solid"
          //   loading={loading}
          onClick={deletePrompt}
        >
          Delete
        </Button>,

        <Button
          key="submit"
          type="primary"
          //   loading={loading}
          onClick={createPrompt}
        >
          Save as New
        </Button>,
        <Button
          key="submit"
          type="primary"
          disabled={promptData?.id === "default"}
          onClick={editPrompt}
        >
          Save
        </Button>,
      ]}
    >
      <div
        style={{
          fontSize: "12px",
          color: "#ccc",
          flex: "1 1 auto",
          marginTop: "20px",
        }}
      >
        Title
      </div>
      <div style={{ marginTop: "5px" }}>
        <Input
          style={{ width: "300px" }}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
        />
      </div>
      <div
        style={{
          fontSize: "12px",
          color: "#ccc",
          flex: "1 1 auto",
          marginTop: "10px",
        }}
      >
        Prompt
      </div>
      <div>
        <TextArea
          rows={20}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
          }}
        />
      </div>
    </Modal>
  );
};

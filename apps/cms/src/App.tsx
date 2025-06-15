import { Authenticated, CanAccess, Refine } from "@refinedev/core";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";

import {
  ErrorComponent,
  ThemedLayoutV2,
  ThemedSiderV2,
  useNotificationProvider,
} from "@refinedev/antd";
import "@refinedev/antd/dist/reset.css";

import routerBindings, {
  CatchAllNavigate,
  DocumentTitleHandler,
  NavigateToResource,
  UnsavedChangesNotifier,
} from "@refinedev/react-router-v6";
import { App as AntdApp } from "antd";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import { authProvider } from "./authProvider";
import { AppIcon } from "./components/app-icon";
import { Header } from "./components/header";
import { ColorModeContextProvider } from "./contexts/color-mode";
import { ForgotPassword } from "./pages/forgotPassword";
import { Login } from "./pages/login";
import { Register } from "./pages/register";
import { UserCreate, UserEdit, UserList, UserShow } from "./pages/users";
import { FileSearchOutlined, FileTextOutlined, MessageOutlined, DatabaseOutlined, ApartmentOutlined } from "@ant-design/icons";

import { accessControlProvider } from "./accessControlProvider";
import { PostCreate, PostEdit, PostList, PostShow } from "./pages/posts";
import { LoggerList } from "./pages/logger/list";
import { WorkflowEditor, WorkflowCreate, WorkflowEdit, WorkflowList, WorkflowShow } from "./pages/workflows";
import { PromptCreate, PromptList } from "./pages/prompts";
import dataProvider from "@refinedev/nestjsx-crud";
import { apiUrl, appConfig } from "./appConfig";
import axiosInstance from "./utils/axiosInstance";
import { DatasetList, DatasetCreate, DatasetUpload } from "./pages/datasets";

function App() {
  return (
    <BrowserRouter>
      <RefineKbarProvider>
        <ColorModeContextProvider>
          <AntdApp>
            <Refine
              dataProvider={dataProvider(apiUrl, axiosInstance)}
              notificationProvider={useNotificationProvider}
              authProvider={authProvider}
              accessControlProvider={accessControlProvider}
              routerProvider={routerBindings}
              resources={[
                // {
                //   name: "users",
                //   list: "/users",
                //   create: "/users/create",
                //   edit: "/users/edit/:id",
                //   show: "/users/show/:id",
                //   meta: {
                //     canDelete: true,
                //     icon: <UserOutlined />,
                //   },
                // },
                // {
                //   name: "roles",
                //   list: "/roles",
                //   create: "/roles/create",
                //   edit: "/roles/edit/:id",
                //   show: "/roles/show/:id",
                //   meta: {
                //     canDelete: true,
                //     icon: <TeamOutlined />,
                //   },
                // },
                // {
                //   name: "permissions",
                //   list: "/permissions",
                //   create: "/permissions/create",
                //   edit: "/permissions/edit/:id",
                //   show: "/permissions/show/:id",
                //   meta: {
                //     canDelete: true,
                //     icon: <SafetyCertificateOutlined />,
                //   },
                // },
                {
                  name: "workflows",
                  list: "/workflows",
                  create: "/workflows/create",
                  edit: "/workflows/edit/:id",
                  show: "/workflows/show/:id",
                  meta: {
                    canDelete: true,
                    icon: <ApartmentOutlined />,
                  },
                },
                {
                  name: "posts",
                  list: "/posts",
                  create: "/posts/create",
                  edit: "/posts/edit/:id",
                  show: "/posts/show/:id",
                  meta: {
                    canDelete: true,
                    icon: <FileTextOutlined />,
                  },
                },
                {
                  name: "prompts",
                  list: "/prompts",
                  create: "/prompts/create",
                  meta: {
                    icon: <MessageOutlined />,
                  },
                },
                {
                  name: "datasets",
                  list: "/datasets",
                  create: "/datasets/create",
                  meta: {
                    icon: <DatabaseOutlined />,
                  },
                },
                {
                  name: "logger",
                  list: "/logger",
                  // create: "/posts/create",
                  // edit: "/posts/edit/:id",
                  show: "/logger/show/:id",
                  meta: {
                    canDelete: false,
                    icon: <FileSearchOutlined />,
                  },
                },
              ]}
              options={{
                syncWithLocation: true,
                warnWhenUnsavedChanges: true,
                useNewQueryKeys: true,
                title: { text: appConfig.name, icon: <AppIcon /> },
                disableTelemetry: true,
              }}
            >
              <Routes>
                <Route
                  element={
                    <Authenticated
                      key="authenticated-inner"
                      fallback={<CatchAllNavigate to="/login" />}
                    >
                      <ThemedLayoutV2
                        Header={Header}
                        Sider={(props) => <ThemedSiderV2 {...props} fixed />}
                      >
                        <CanAccess
                          fallback={<NavigateToResource resource="posts" />}
                        >
                          <Outlet />
                        </CanAccess>
                      </ThemedLayoutV2>
                    </Authenticated>
                  }
                >
                  <Route
                    index
                    element={<NavigateToResource resource="workflows" />}
                  />
                  <Route path="/users">
                    <Route index element={<UserList />} />
                    <Route path="create" element={<UserCreate />} />
                    <Route path="edit/:id" element={<UserEdit />} />
                    <Route path="show/:id" element={<UserShow />} />
                  </Route>
                  {/* <Route path="/roles">
                    <Route index element={<RoleList />} />
                    <Route path="create" element={<RoleCreate />} />
                    <Route path="edit/:id" element={<RoleEdit />} />
                    <Route path="show/:id" element={<RoleShow />} />
                  </Route>
                  <Route path="/permissions">
                    <Route index element={<PermissionList />} />
                    <Route path="create" element={<PermissionCreate />} />
                    <Route path="edit/:id" element={<PermissionEdit />} />
                    <Route path="show/:id" element={<PermissionShow />} />
                  </Route> */}
                  <Route path="/prompts">
                    <Route index element={<PromptList />} />
                    <Route path="create" element={<PromptCreate />} />
                  </Route>
                  <Route path="/posts">
                    <Route index element={<PostList />} />
                    <Route path="create" element={<PostCreate />} />
                    <Route path="edit/:id" element={<PostEdit />} />
                    <Route path="show/:id" element={<PostShow />} />
                  </Route>
                  <Route path="/workflows">
                    <Route index element={<WorkflowList />} />
                    <Route path="editor" element={<WorkflowEditor />} />
                    <Route path="editor/:id" element={<WorkflowEditor />} />
                    <Route path="create" element={<WorkflowCreate />} />
                    <Route path="edit/:id" element={<WorkflowEdit />} />
                    <Route path="show/:id" element={<WorkflowShow />} />
                  </Route>
                  <Route path="/datasets">
                    <Route index element={<DatasetList />} />
                    <Route path="create" element={<DatasetCreate />} />
                    <Route path="upload" element={<DatasetUpload />} />
                  </Route>
                  <Route path="/logger">
                    <Route index element={<LoggerList />} />
                  </Route>
                  <Route path="*" element={<ErrorComponent />} />
                </Route>
                <Route
                  element={
                    <Authenticated
                      key="authenticated-outer"
                      fallback={<Outlet />}
                    >
                      <NavigateToResource />
                    </Authenticated>
                  }
                >
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                </Route>
              </Routes>

              <RefineKbar />
              <UnsavedChangesNotifier />
              <DocumentTitleHandler handler={() => "Knowledge Hub CMS"} />
            </Refine>
          </AntdApp>
        </ColorModeContextProvider>
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;

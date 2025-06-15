import { AccessControlProvider } from "@refinedev/core";
import { USER_KEY } from "./authProvider";

export const accessControlProvider: AccessControlProvider = {
  can: async ({ resource, action, params }) => {
    const user = localStorage.getItem(USER_KEY);
    if (user) {
      return { can: true };

      const { permissions } = JSON.parse(user);

      const permissionMapping: { [key: string]: string } = {
        list: "view",
        show: "view",
        create: "edit",
        edit: "edit",
        delete: "delete",
      };

      const hasPermission = permissions.some(
        (permission: { resource: string; action: string }) =>
          permission.resource === resource &&
          permission.action === permissionMapping[action]
      );

      if (hasPermission) {
        return { can: true };
      } else {
        return {
          can: false,
          reason:
            "Unauthorized: You don't have permission to perform this action",
        };
      }
    }

    return {
      can: false,
      reason: "Unauthorized: User not logged in",
    };
  },
};

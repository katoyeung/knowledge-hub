import { User } from '@modules/user/user.entity';
import { CrudAuth } from '@dataui/crud';
import { UnauthorizedException } from '@nestjs/common';

type Condition = {
  field: string;
  value: any;
  type?: 'role' | 'field'; // to distinguish between role and field conditions
};

/**
 * CrudAuthFilter decorator for controlling access to CRUD operations based on user roles and field conditions.
 * By default, it only allows users to access their own records (matching userId).
 *
 * @param userIdField - The field name that contains the user ID (default: 'userId')
 * @param conditions - Array of conditions to check for access
 *
 * Examples:
 *
 * 1. Default usage - only allow users to access their own records:
 * @CrudAuthFilter()
 *
 * 2. Allow access to global records:
 * @CrudAuthFilter('userId', [{ field: 'isGlobal', value: true, type: 'field' }])
 *
 * 3. Allow access to admin users:
 * @CrudAuthFilter('userId', [{ field: 'admin', value: true, type: 'role' }])
 *
 * 4. Multiple conditions:
 * @CrudAuthFilter('userId', [
 *   { field: 'isGlobal', value: true, type: 'field' },
 *   { field: 'admin', value: true, type: 'role' }
 * ])
 */
export const CrudAuthFilter = (
  userIdField: string = 'userId',
  conditions: Condition[] = [],
) => {
  return CrudAuth({
    property: 'user',
    filter: (user: User) => {
      // Check if there are any role conditions
      const roleConditions = conditions.filter(
        (c) => c.type === 'role' && c.value,
      );

      // If there are role conditions, check if user has any of the required roles
      if (roleConditions.length > 0) {
        const hasRequiredRole = roleConditions.some((condition) =>
          user.roles.some((role) => role.name === condition.field),
        );

        if (!hasRequiredRole) {
          return { id: -1 }; // Return no results for users without required roles
        }
        return {}; // Users with required roles can see all records
      }

      // For regular users, show their own records OR records matching any of the field conditions
      const fieldConditions = conditions.filter((c) => c.type === 'field');
      if (fieldConditions.length === 0) {
        return { [userIdField]: user.id }; // Default to only showing user's own records
      }

      return {
        $or: [
          { [userIdField]: user.id },
          ...fieldConditions.map((condition) => ({
            [condition.field]: condition.value,
          })),
        ],
      };
    },
    persist: (user: User) => {
      // Check if there are any role conditions
      const roleConditions = conditions.filter((c) => c.type === 'role');

      // If there are role conditions, check if user has any of the required roles
      if (roleConditions.length > 0) {
        const hasRequiredRole = roleConditions.some((condition) =>
          user.roles.some((role) => role.name === condition.field),
        );

        if (!hasRequiredRole) {
          throw new UnauthorizedException(
            'You are not authorized to access this resource',
          );
        }
        return {}; // Users with required roles can set any values
      }

      // For regular users, always set their userId
      return {
        [userIdField]: user.id,
      };
    },
  });
};

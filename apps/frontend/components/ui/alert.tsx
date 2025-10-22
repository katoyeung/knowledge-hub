import React from 'react';
import { cn } from '@/lib/utils';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: 'default' | 'destructive' | 'warning' | 'success';
}

export interface AlertDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> { }

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
    ({ className, variant = 'default', ...props }, ref) => {
        return (
            <div
                ref={ref}
                role="alert"
                className={cn(
                    'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
                    {
                        'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200': variant === 'destructive',
                        'border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200': variant === 'warning',
                        'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200': variant === 'success',
                        'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200': variant === 'default',
                    },
                    className
                )}
                {...props}
            />
        );
    }
);
Alert.displayName = 'Alert';

const AlertDescription = React.forwardRef<HTMLParagraphElement, AlertDescriptionProps>(
    ({ className, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={cn('text-sm [&_p]:leading-relaxed', className)}
                {...props}
            />
        );
    }
);
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertDescription };

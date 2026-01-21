import { jsx as _jsx } from "react/jsx-runtime";
import { cn, getStatusColor } from '@/lib/utils';
export function Badge({ children, variant = 'default', status, className }) {
    return (_jsx("span", { className: cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', variant === 'status' && status ? getStatusColor(status) : 'bg-gray-100 text-gray-800', className), children: children }));
}

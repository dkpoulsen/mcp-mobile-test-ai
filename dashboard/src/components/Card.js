import { jsx as _jsx } from "react/jsx-runtime";
import { cn } from '@/lib/utils';
export function Card({ children, className }) {
    return (_jsx("div", { className: cn('rounded-lg border border-gray-200 bg-white shadow-sm', className), children: children }));
}
export function CardHeader({ children, className }) {
    return (_jsx("div", { className: cn('flex flex-col space-y-1.5 p-6', className), children: children }));
}
export function CardTitle({ children, className }) {
    return (_jsx("h3", { className: cn('text-xl font-semibold leading-none tracking-tight', className), children: children }));
}
export function CardContent({ children, className }) {
    return (_jsx("div", { className: cn('p-6 pt-0', className), children: children }));
}

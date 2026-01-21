import { jsx as _jsx } from "react/jsx-runtime";
export function Spinner({ size = 'md' }) {
    const sizeClass = {
        sm: 'h-4 w-4 border-2',
        md: 'h-8 w-8 border-2',
        lg: 'h-12 w-12 border-3',
    }[size];
    return (_jsx("div", { className: "flex items-center justify-center", children: _jsx("div", { className: `${sizeClass} animate-spin rounded-full border-gray-300 border-t-blue-600` }) }));
}
export function CenteredSpinner() {
    return (_jsx("div", { className: "flex min-h-[400px] items-center justify-center", children: _jsx(Spinner, { size: "lg" }) }));
}

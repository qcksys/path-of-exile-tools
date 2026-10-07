import { Children, type ComponentProps, Fragment, isValidElement, type ReactNode } from "react";
import { cn } from "~/lib/utils";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./select";

type OptionProps = { value: string | number; children: ReactNode; disabled?: boolean };
function optionsFromChildren(children: ReactNode): OptionProps[] {
    return Children.toArray(children).flatMap((child) => {
        if (!isValidElement<OptionProps>(child)) return [];
        if (child.type === Fragment) return optionsFromChildren(child.props.children);
        return [{ ...child.props, value: String(child.props.value) }];
    });
}

type Props = Omit<
    ComponentProps<typeof SelectTrigger>,
    "children" | "defaultValue" | "value" | "onChange"
> & {
    children: ReactNode;
    value?: string | number;
    defaultValue?: string | number;
    name?: string;
    required?: boolean;
    onValueChange?: (value: string) => void;
};

export function FormSelect({
    children,
    value,
    defaultValue,
    name,
    required,
    disabled,
    onValueChange,
    className,
    ...trigger
}: Props) {
    const options = optionsFromChildren(children);
    return (
        <Select
            items={options.map((option) => ({ value: option.value, label: option.children }))}
            value={value === undefined ? undefined : String(value)}
            defaultValue={
                defaultValue === undefined ? String(options[0]?.value ?? "") : String(defaultValue)
            }
            name={name}
            required={required}
            disabled={disabled}
            onValueChange={(next) => {
                if (next !== null) onValueChange?.(String(next));
            }}
        >
            <SelectTrigger className={cn("w-full", className)} {...trigger}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectGroup>
                    {options.map((option) => (
                        <SelectItem
                            key={option.value}
                            value={option.value}
                            disabled={option.disabled}
                            data-value={option.value}
                        >
                            {option.children}
                        </SelectItem>
                    ))}
                </SelectGroup>
            </SelectContent>
        </Select>
    );
}

export function FormSelectItem(props: OptionProps) {
    return <SelectItem {...props} />;
}

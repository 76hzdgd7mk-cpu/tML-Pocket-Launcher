import { Button, Icon } from '../../components/ui';

export function NativeAcquireAction({
  title,
  description,
  symbol,
  onClick,
  label = title,
  action,
}: {
  title: string;
  description: string;
  symbol: string;
  onClick: () => void;
  label?: string;
  action?: string;
}) {
  return (
    <Button
      className="native-acquire-action"
      aria-label={label}
      data-action={action}
      onClick={onClick}
    >
      <Icon name={symbol} />
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <Icon name="chevron" />
    </Button>
  );
}

export function NativeField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="native-field">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

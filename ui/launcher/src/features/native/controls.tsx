import { Button, Icon } from '../../components/ui';
import { useTranslation } from '../../i18n';

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
  const { t } = useTranslation();
  return (
    <Button
      className="native-acquire-action"
      aria-label={t(label)}
      data-action={action}
      onClick={onClick}
    >
      <Icon name={symbol} />
      <span>
        <strong>{t(title)}</strong>
        <small>{t(description)}</small>
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
  const { t } = useTranslation();
  return (
    <label className="native-field">
      <span>{t(label)}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder === undefined ? undefined : t(placeholder)}
      />
    </label>
  );
}

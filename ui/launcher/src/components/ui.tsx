import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ComponentProps, ReactNode } from 'react';
import { Button as AnimateButton } from '@animate-ui/react/primitives/buttons/button';
import * as SwitchPrimitive from '@animate-ui/react/primitives/radix-ui/switch';
import * as TabsPrimitive from '@animate-ui/react/primitives/radix-ui/tabs';
import * as ProgressPrimitive from '@animate-ui/react/primitives/radix-ui/progress';
import { Tooltip } from './tooltip';
import { Menu } from './icons/menu';
import { LayoutTemplate } from './icons/layout-template';
import { Settings } from './icons/settings';
import { useTranslation } from '../i18n';

export function Icon({ name, className = '' }: { name: string; className?: string }) {
  if (name === 'home') return <Menu aria-hidden="true" focusable="false" className={className} />;
  if (name === 'mod')
    return <LayoutTemplate aria-hidden="true" focusable="false" className={className} />;
  if (name === 'settings')
    return <Settings aria-hidden="true" focusable="false" className={className} />;
  return (
    <svg aria-hidden="true" className={className}>
      <use href={`/icons.svg#i-${name}`} />
    </svg>
  );
}
export function Button({
  children,
  className = '',
  symbol,
  variant = '',
  ...props
}: Omit<ComponentProps<typeof AnimateButton>, 'children' | 'asChild'> & {
  children?: ReactNode;
  symbol?: string;
  variant?: string;
}) {
  return (
    <AnimateButton
      type="button"
      className={`${!className || variant ? 'button' : ''} ${variant} ${className}`}
      {...props}
    >
      {symbol && <Icon name={symbol} />} {children}
    </AnimateButton>
  );
}
export function IconButton({
  symbol,
  label,
  ...props
}: ComponentProps<typeof AnimateButton> & { symbol: string; label: string }) {
  return (
    <Tooltip label={label}>
      <AnimateButton type="button" className="icon-button" aria-label={label} {...props}>
        <Icon name={symbol} />
      </AnimateButton>
    </Tooltip>
  );
}
export function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Switch({
  checked,
  onChange,
  label,
  action,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  action?: string;
  disabled?: boolean;
}) {
  return (
    <SwitchPrimitive.Root
      className="switch animate-switch"
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      data-action={action}
      disabled={disabled}
    >
      <SwitchPrimitive.Thumb className="switch-thumb" />
    </SwitchPrimitive.Root>
  );
}
export function EmptyState({
  symbol,
  title,
  description,
  children,
}: {
  symbol: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-symbol">
        <Icon name={symbol} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      <div>{children}</div>
    </div>
  );
}
export function ContextNote({ children }: { children: ReactNode }) {
  return (
    <p className="context-note">
      <Icon name="info" />
      {children}
    </p>
  );
}
export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
  content: ReactNode;
  id?: string;
  data?: Record<string, string>;
}
export function WorkspaceTabs<T extends string>({
  value,
  onChange,
  items,
  label,
  className = '',
}: {
  value: T;
  onChange: (value: T) => void;
  items: TabItem<T>[];
  label: string;
  className?: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.getElementById('page-tabs'),
  );
  useLayoutEffect(() => {
    const target = document.getElementById('page-tabs');
    if (target && target !== slot) setSlot(target);
  }, [slot]);
  useLayoutEffect(() => {
    list.current
      ?.querySelector('[role="tab"][aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [value, slot]);
  return (
    <TabsPrimitive.Root
      className="workspace-tabs"
      value={value}
      onValueChange={(next) => onChange(next as T)}
    >
      {slot &&
        createPortal(
          <TabsPrimitive.List
            ref={list}
            className={`tabbar ${className}`}
            aria-label={label}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            onKeyDown={(event) => {
              if (event.key !== 'Home' && event.key !== 'End') return;
              event.preventDefault();
              const index = event.key === 'Home' ? 0 : items.length - 1;
              onChange(items[index].value);
              event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[index]?.focus();
            }}
          >
            {items.map((item) => (
              <TabsPrimitive.Trigger
                key={item.value}
                value={item.value}
                id={item.id}
                className={`tab ${value === item.value ? 'active' : ''}`}
                {...item.data}
              >
                {item.label}
                {item.count !== undefined && <span className="tab-count">{item.count}</span>}
              </TabsPrimitive.Trigger>
            ))}
          </TabsPrimitive.List>,
          slot,
        )}
      {items.map((item) => (
        <TabsPrimitive.Content
          key={item.value}
          value={item.value}
          className="workspace-tab-panel"
          transition={{
            duration: 0.16,
            ease: [0.23, 1, 0.32, 1],
            height: { duration: 0 },
          }}
          exitTransition={{ duration: 0.08 }}
        >
          {item.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
export function TaskProgress({ value = 38 }: { value?: number | null }) {
  const { t } = useTranslation();
  return (
    <ProgressPrimitive.Root className="meter" value={value} aria-label={t('下载进度')}>
      <ProgressPrimitive.Indicator
        style={{ transform: `translateX(-${value === null ? 0 : 100 - value}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
export function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{title}</strong>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mod-select-row">
      <span>{label}</span>
      {children}
    </label>
  );
}

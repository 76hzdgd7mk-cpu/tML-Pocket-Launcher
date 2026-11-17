import * as SelectPrimitive from '@animate-ui/react/primitives/radix-ui/select';
import * as SliderPrimitive from '@animate-ui/react/primitives/radix-ui/slider';
import { Icon } from './ui';

export function Select({
  label,
  options,
  value,
  defaultValue,
  onChange,
}: {
  label: string;
  options: readonly (readonly [string, string])[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <SelectPrimitive.Root value={value} defaultValue={defaultValue} onValueChange={onChange}>
      <SelectPrimitive.Trigger className="select-trigger" aria-label={label}>
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon className="select-chevron">
          <Icon name="chevron" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="select-content primitive-popup"
          position="popper"
          sideOffset={6}
          collisionPadding={12}
        >
          <SelectPrimitive.ScrollUpButton className="select-scroll select-scroll-up">
            <Icon name="chevron" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="select-viewport">
            {options.map(([id, title]) => (
              <SelectPrimitive.Item className="select-item" value={id} key={id}>
                <SelectPrimitive.ItemText>{title}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="select-check">
                  <Icon name="check" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="select-scroll">
            <Icon name="chevron" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  onChange,
  id,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  id?: string;
}) {
  return (
    <div className="range-control">
      <SliderPrimitive.Root
        className="slider-control"
        min={min}
        max={max}
        step={1}
        value={[value]}
        onValueChange={([next]) => {
          if (next !== undefined) onChange(next);
        }}
      >
        <SliderPrimitive.Track className="slider-track">
          <SliderPrimitive.Range className="slider-range" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className="slider-thumb"
          id={id}
          aria-label={label}
          aria-valuetext={`${value}%`}
        />
      </SliderPrimitive.Root>
      <output aria-live="off">{value}%</output>
    </div>
  );
}

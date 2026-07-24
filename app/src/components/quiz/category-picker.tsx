import { Chip } from "@higgsfield/quanta/chip";
import { Tabs } from "@higgsfield/quanta/tabs";
import { Typography } from "@higgsfield/quanta/typography";
import type { Category, Difficulty } from "@/lib/categories";

const DIFFICULTY_TABS: { value: Difficulty; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

export function DifficultyTabs({
  value,
  onChange,
}: {
  value: Difficulty;
  onChange: (d: Difficulty) => void;
}) {
  return (
    <Tabs.Root variant="segmented" value={value} onValueChange={(v) => onChange(v as Difficulty)}>
      <Tabs.List>
        {DIFFICULTY_TABS.map((tab) => (
          <Tabs.Tab key={tab.value} value={tab.value}>
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs.Root>
  );
}

export function CategoryPicker({
  categories,
  selectedKeys,
  onToggle,
  multiple = false,
  maxSelected,
}: {
  categories: Category[];
  selectedKeys: string[];
  onToggle: (key: string) => void;
  multiple?: boolean;
  maxSelected?: number;
}) {
  const grouped = {
    "top-level": categories.filter((c) => c.kind === "top-level"),
    combo: categories.filter((c) => c.kind === "combo"),
    modifier: categories.filter((c) => c.kind === "modifier"),
  } as const;

  const atMax = maxSelected != null && selectedKeys.length >= maxSelected;

  const renderGroup = (label: string, items: Category[]) => {
    if (items.length === 0) return null;
    return (
      <div className="flex flex-col gap-2" key={label}>
        <Typography as="span" variant="caption-sm-medium" color="tertiary">
          {label}
        </Typography>
        <div className="flex flex-wrap gap-2">
          {items.map((cat) => {
            const isSelected = selectedKeys.includes(cat.key);
            const disabled = multiple && !isSelected && atMax;
            return (
              <Chip
                key={cat.key}
                selected={isSelected}
                disabled={disabled}
                onClick={() => onToggle(cat.key)}
              >
                {cat.label}
              </Chip>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {renderGroup("Domains", grouped["top-level"])}
      {renderGroup("Categories", grouped.combo)}
      {renderGroup("Topics", grouped.modifier)}
    </div>
  );
}

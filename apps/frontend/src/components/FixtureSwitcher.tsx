import type { FixtureKey } from "../fixtures";

interface FixtureSwitcherProps {
  fixtureKey: FixtureKey;
  fixtureKeys: FixtureKey[];
  onSelect: (fixtureKey: FixtureKey) => void;
}

export function FixtureSwitcher({
  fixtureKey,
  fixtureKeys,
  onSelect,
}: FixtureSwitcherProps) {
  return (
    <label className="fixture-switcher">
      <span>Fixture</span>
      <select
        value={fixtureKey}
        onChange={(event) => onSelect(event.target.value as FixtureKey)}
      >
        {fixtureKeys.map((key) => (
          <option key={key} value={key}>
            {key}
          </option>
        ))}
      </select>
    </label>
  );
}

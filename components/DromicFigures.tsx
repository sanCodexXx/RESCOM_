'use client';

import { Field } from './ui';

const fields = {
  affected: [['barangays', 'Affected barangays'], ['families', 'Affected families'], ['persons', 'Affected people']],
  outside: [
    ['cumulativeFamilies', 'Cumulative families'], ['currentFamilies', 'Current families'],
    ['cumulativePersons', 'Cumulative people'], ['currentPersons', 'Current people'],
  ],
} as const;

type Figures = {
  source: string;
  affected?: Record<string, number | ''>;
  outside?: Record<string, number | ''>;
};

export default function DromicFigures({ figures, onChange }: {
  figures?: Figures | null;
  onChange: (figures: Figures | null) => void;
}) {
  const values = figures || { source: '' };
  return (
    <div className="report-verified">
      <h3>Verified figures</h3>
      <p>Enter figures only when your team has a source for them.</p>
      {(['affected', 'outside'] as const).map(group => (
        <fieldset key={group}>
          <legend>
            <label>
              <input type="checkbox" checked={!!values[group]} onChange={e => {
                const next = {
                  ...values,
                  [group]: e.target.checked ? Object.fromEntries(fields[group].map(([key]) => [key, ''])) : undefined,
                } as Figures;
                onChange(next.affected || next.outside ? next : null);
              }} />
              {group === 'affected' ? 'Affected population' : 'Displaced outside evacuation centers'}
            </label>
          </legend>
          {values[group] && <div className="form-grid">
            {fields[group].map(([key, label]) => (
              <Field key={key} label={label} required>
                <input type="number" min={0} max={2147483647} step={1} value={values[group]?.[key] ?? ''} required onChange={e =>
                  onChange({ ...values, [group]: { ...values[group], [key]: e.target.value === '' ? '' : Number(e.target.value) } })
                } />
              </Field>
            ))}
          </div>}
        </fieldset>
      ))}
      {(values.affected || values.outside) && <Field label="Source of verified figures" required>
        <input value={values.source} onChange={e => onChange({ ...values, source: e.target.value })} maxLength={160} required />
      </Field>}
    </div>
  );
}

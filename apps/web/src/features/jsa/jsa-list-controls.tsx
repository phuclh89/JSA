import { SearchOutlined } from '@ant-design/icons';
import { Button, Input, Select } from 'antd';
import type { ReactNode } from 'react';

export type JsaListSearchField =
  | 'ALL'
  | 'JSA_NUMBER'
  | 'JOB_TITLE'
  | 'TASK'
  | 'HAZARD'
  | 'CONTROL'
  | 'PROMPT'
  | 'CREATOR'
  | 'APPROVER';

export interface JsaListAction {
  key: string;
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
  onClick: () => void;
}

export function JsaListRibbon({
  ariaLabel,
  actions,
}: {
  ariaLabel: string;
  actions: JsaListAction[];
}) {
  return (
    <section className="published-ribbon" aria-label={ariaLabel}>
      <div className="published-ribbon-actions">
        {actions.map((action) => (
          <Button
            key={action.key}
            className="published-ribbon-action"
            type="text"
            disabled={action.disabled}
            title={action.disabled ? action.disabledReason : undefined}
            aria-label={
              action.disabled && action.disabledReason
                ? `${action.label}. Unavailable: ${action.disabledReason}`
                : action.label
            }
            onClick={action.onClick}
          >
            <span aria-hidden="true">{action.icon}</span>
            <strong>{action.label}</strong>
          </Button>
        ))}
      </div>
    </section>
  );
}

export function JsaListFilters({
  department,
  departmentOptions,
  keyword,
  searchField,
  onDepartmentChange,
  onKeywordChange,
  onSearchFieldChange,
}: {
  department: string;
  departmentOptions: Array<{ value: string; label: string }>;
  keyword: string;
  searchField: JsaListSearchField;
  onDepartmentChange: (value: string) => void;
  onKeywordChange: (value: string) => void;
  onSearchFieldChange: (value: JsaListSearchField) => void;
}) {
  return (
    <div className="published-filter-bar">
      <label>
        <span>Department</span>
        <Select
          value={department}
          onChange={onDepartmentChange}
          options={[{ value: 'all', label: 'All Departments' }, ...departmentOptions]}
        />
      </label>
      <label className="published-keyword-filter">
        <span>Keyword</span>
        <Input
          allowClear
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          prefix={<SearchOutlined />}
          placeholder="Search JSA"
        />
      </label>
      <label>
        <span>Search in</span>
        <Select<JsaListSearchField>
          value={searchField}
          onChange={onSearchFieldChange}
          options={[
            { value: 'ALL', label: 'All searchable content' },
            { value: 'JSA_NUMBER', label: 'JSA Number' },
            { value: 'JOB_TITLE', label: 'Job Title' },
            { value: 'TASK', label: 'Task' },
            { value: 'HAZARD', label: 'Hazard' },
            { value: 'CONTROL', label: 'Control' },
            { value: 'PROMPT', label: 'Hazard Prompt' },
            { value: 'CREATOR', label: 'Creator' },
            { value: 'APPROVER', label: 'Approver / Publisher' },
          ]}
        />
      </label>
    </div>
  );
}

export function uniqueJsaListOptions(options: Array<{ value: string; label: string }>) {
  return [...new Map(options.map((option) => [option.value, option])).values()].sort(
    (left, right) => left.label.localeCompare(right.label),
  );
}

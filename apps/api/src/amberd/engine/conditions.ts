import { ConditionEvaluation, ConditionRule } from '@app-starter/shared';
import { readPath } from './output-schema';

const toComparable = (value: unknown): number | string | boolean | null => {
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    return value.trim() !== '' && Number.isFinite(numeric) ? numeric : value;
  }
  return value === undefined || value === null ? null : JSON.stringify(value);
};

export const compare = (operator: ConditionRule['operator'], left: unknown, right: unknown): boolean => {
  const l = toComparable(left);
  const r = toComparable(right);
  switch (operator) {
    case 'eq':
      return l === r;
    case 'neq':
      return l !== r;
    case 'gt':
      return typeof l === 'number' && typeof r === 'number' && l > r;
    case 'lt':
      return typeof l === 'number' && typeof r === 'number' && l < r;
    case 'gte':
      return typeof l === 'number' && typeof r === 'number' && l >= r;
    case 'lte':
      return typeof l === 'number' && typeof r === 'number' && l <= r;
    case 'contains':
      if (Array.isArray(left)) return left.map((item) => String(item)).includes(String(right));
      return typeof left === 'string' && left.toLowerCase().includes(String(right).toLowerCase());
  }
};

/**
 * Evaluate the agent's IF/THEN rules in application code against the final
 * results. A missing field evaluates to false (no silent pass on bad data) and
 * is reported in the evaluation.
 */
export const evaluateConditions = (
  rules: ConditionRule[],
  results: Record<string, unknown>,
  variables: Record<string, unknown>,
): ConditionEvaluation[] =>
  rules.map((rule) => {
    const left = readPath(results, rule.field);
    const right = rule.valueFromVariable !== undefined ? (variables[rule.valueFromVariable] ?? 0) : rule.value;
    const result = left === undefined ? false : compare(rule.operator, left, right);
    return {
      id: rule.id,
      name: rule.name,
      field: rule.field,
      operator: rule.operator,
      left: left === undefined ? '(missing)' : left,
      right,
      result,
      actionsTriggered: result ? rule.thenActions : rule.elseActions,
    };
  });

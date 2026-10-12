/**
 * Amberd agent definition — the single schema behind the visual builder, the
 * JSON editor, import/export, and the execution engine.
 *
 * Definitions are declarative data only. There is deliberately no field that
 * can carry executable code: computation the engine performs deterministically
 * is selected by name from `DETERMINISTIC_VALIDATORS`, never supplied inline.
 */

export const AGENT_DEFINITION_SCHEMA_VERSION = '1.0' as const;

export const AGENT_STATUSES = ['ACTIVE', 'INACTIVE', 'DRAFT'] as const;
export type AgentStatusValue = (typeof AGENT_STATUSES)[number];

export const LLM_PROVIDERS = [
  'anthropic',
  'openai',
  'gemini',
  'open-source',
  'open-weight',
  'custom',
] as const;
export type LlmProviderId = (typeof LLM_PROVIDERS)[number];

export const LLM_EFFORTS = ['low', 'medium', 'high'] as const;
export type LlmEffort = (typeof LLM_EFFORTS)[number];

export const TRIGGER_TYPES = ['MANUAL', 'API', 'SCHEDULED', 'CONTINUOUS'] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const SCHEDULE_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'] as const;
export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCIES)[number];

export const VARIABLE_TYPES = ['string', 'number', 'boolean', 'date', 'json'] as const;
export type VariableType = (typeof VARIABLE_TYPES)[number];

export const DATA_OPERATIONS = ['list', 'read'] as const;
export type DataOperation = (typeof DATA_OPERATIONS)[number];

export const CONDITION_OPERATORS = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains'] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const CONDITION_OPERATOR_LABELS: Record<ConditionOperator, string> = {
  eq: 'equals',
  neq: 'not equals',
  gt: 'greater than',
  lt: 'less than',
  gte: 'greater than or equal',
  lte: 'less than or equal',
  contains: 'contains',
};

export const ACTION_TYPES = [
  'GENERATE_REPORT',
  'FLAG_DISCREPANCY',
  'CREATE_NOTIFICATION',
  'REQUEST_APPROVAL',
  'SAVE_RESULT',
  'MARK_PASSED',
  'SEND_EMAIL',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  GENERATE_REPORT: 'Generate report',
  FLAG_DISCREPANCY: 'Flag discrepancy',
  CREATE_NOTIFICATION: 'Create notification',
  REQUEST_APPROVAL: 'Request human approval',
  SAVE_RESULT: 'Save execution result',
  MARK_PASSED: 'Mark audit passed',
  SEND_EMAIL: 'Email report',
};

export const MAX_EMAIL_RECIPIENTS = 20;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isValidEmail = (value: string): boolean => EMAIL_PATTERN.test(value) && value.length <= 254;

export const ACTION_RUN_WHEN = ['ALWAYS', 'ON_CONDITION'] as const;
export type ActionRunWhen = (typeof ACTION_RUN_WHEN)[number];

export const PRIORITY_TIERS = ['CRITICAL', 'STANDARD', 'BEST_EFFORT'] as const;
export type PriorityTier = (typeof PRIORITY_TIERS)[number];

export const PRIORITY_TIER_LABELS: Record<PriorityTier, string> = {
  CRITICAL: 'Critical / Priority',
  STANDARD: 'Standard',
  BEST_EFFORT: 'Best Effort',
};

/** Named, built-in deterministic post-processors the engine can apply. */
export const DETERMINISTIC_VALIDATORS = ['invoice_reconciliation'] as const;
export type DeterministicValidator = (typeof DETERMINISTIC_VALIDATORS)[number];

export const DETERMINISTIC_VALIDATOR_LABELS: Record<DeterministicValidator, string> = {
  invoice_reconciliation:
    'Invoice reconciliation — recomputes line totals, matches items, and calculates the discrepancy in backend code',
};

export const DEPARTMENTS = [
  'Finance',
  'Operations',
  'Risk & Compliance',
  'Customer Success',
  'Engineering',
  'Human Resources',
  'Sales',
  'IT',
] as const;

export type JsonSchemaType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean';

/** The restricted JSON Schema subset an agent may declare for model output. */
export interface OutputSchemaNode {
  type: JsonSchemaType;
  description?: string;
  properties?: Record<string, OutputSchemaNode>;
  required?: string[];
  items?: OutputSchemaNode;
  enum?: string[];
}

export interface AgentVariable {
  name: string;
  type: VariableType;
  required: boolean;
  defaultValue?: string | number | boolean | null;
  description?: string;
}

/** Binds a variable's value to a document in one of the connection's collections. */
export interface DataInputBinding {
  variable: string;
  collection: string;
  label?: string;
}

export interface AgentDataInput {
  connectionId: string;
  /** Collections (resource prefixes) this agent may touch on the connection. */
  resources: string[];
  operations: DataOperation[];
  bindings: DataInputBinding[];
}

export interface ConditionRule {
  id: string;
  name: string;
  field: string;
  operator: ConditionOperator;
  /** Literal comparison value; ignored when `valueFromVariable` is set. */
  value?: string | number | boolean | null;
  valueFromVariable?: string;
  thenActions: string[];
  elseActions: string[];
}

export interface AgentAction {
  id: string;
  type: ActionType;
  label: string;
  runWhen: ActionRunWhen;
  config?: {
    title?: string;
    message?: string;
    severity?: 'info' | 'warning' | 'critical';
    /** SEND_EMAIL: default recipients; more can be added when the agent is run. */
    recipients?: string[];
    /** SEND_EMAIL: attach the generated PDF report. */
    attachReport?: boolean;
  };
}

export interface AgentDefinition {
  schemaVersion: typeof AGENT_DEFINITION_SCHEMA_VERSION;
  identity: {
    name: string;
    description: string;
    agentKey: string;
    department: string;
    status: AgentStatusValue;
  };
  llm: {
    provider: LlmProviderId;
    model: string;
    temperature: number;
    maxOutputTokens: number;
    effort: LlmEffort;
  };
  trigger: {
    type: TriggerType;
    schedule?: {
      frequency: ScheduleFrequency;
      time?: string;
      dayOfWeek?: number;
      dayOfMonth?: number;
      cron?: string;
      timezone?: string;
    };
  };
  variables: AgentVariable[];
  dataInputs: AgentDataInput[];
  compute: {
    systemInstructions: string;
    taskInstructions: string;
    /** Label shown to the model for each bound document, keyed by variable. */
    inputMapping: Record<string, string>;
    outputSchema: OutputSchemaNode;
    validators: DeterministicValidator[];
  };
  conditions: ConditionRule[];
  actions: AgentAction[];
  resourceLimits: {
    maxConcurrency: number;
    timeoutSeconds: number;
    maxDataResources: number;
    spendCapUsd: number;
    spendWindowDays: number;
    priorityTier: PriorityTier;
  };
}

export interface DefinitionValidationError {
  path: string;
  message: string;
}

export interface DefinitionValidationResult {
  isValid: boolean;
  errors: DefinitionValidationError[];
}

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const AGENT_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
// Local folder names or remote folder/file ids (e.g. Google Drive ids).
const COLLECTION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const ACTION_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MAX_TEXT = 20000;
const MAX_SCHEMA_DEPTH = 6;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isOneOf = <T extends string>(options: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (options as readonly string[]).includes(value);

/**
 * Validate an untrusted value as an `AgentDefinition`.
 *
 * Hand-written rather than library-backed so that the API and the web app run
 * exactly the same checks with no extra dependency in the shared package.
 */
export const validateAgentDefinition = (input: unknown): DefinitionValidationResult => {
  const errors: DefinitionValidationError[] = [];
  const fail = (path: string, message: string): void => {
    errors.push({ path, message });
  };

  if (!isRecord(input)) {
    return { isValid: false, errors: [{ path: '', message: 'Definition must be a JSON object' }] };
  }

  const allowedTopLevel = new Set([
    'schemaVersion',
    'identity',
    'llm',
    'trigger',
    'variables',
    'dataInputs',
    'compute',
    'conditions',
    'actions',
    'resourceLimits',
  ]);
  Object.keys(input).forEach((key) => {
    if (!allowedTopLevel.has(key)) fail(key, 'Unknown top-level field');
  });

  if (input.schemaVersion !== AGENT_DEFINITION_SCHEMA_VERSION) {
    fail('schemaVersion', `Must be "${AGENT_DEFINITION_SCHEMA_VERSION}"`);
  }

  const text = (path: string, value: unknown, { min = 0, max = MAX_TEXT } = {}): void => {
    if (typeof value !== 'string') return fail(path, 'Must be a string');
    if (value.trim().length < min) return fail(path, min === 1 ? 'Is required' : `Min ${min} chars`);
    if (value.length > max) fail(path, `Max ${max} characters`);
  };
  const num = (path: string, value: unknown, min: number, max: number): void => {
    if (typeof value !== 'number' || Number.isNaN(value)) return fail(path, 'Must be a number');
    if (value < min || value > max) fail(path, `Must be between ${min} and ${max}`);
  };

  // identity
  const identity = input.identity;
  if (!isRecord(identity)) {
    fail('identity', 'Is required');
  } else {
    text('identity.name', identity.name, { min: 1, max: 120 });
    text('identity.description', identity.description, { max: 2000 });
    if (typeof identity.agentKey !== 'string' || !AGENT_KEY_PATTERN.test(identity.agentKey)) {
      fail('identity.agentKey', 'Lowercase letters, digits, and dashes (2-64 chars)');
    }
    text('identity.department', identity.department, { min: 1, max: 80 });
    if (!isOneOf(AGENT_STATUSES, identity.status)) fail('identity.status', 'Invalid status');
  }

  // llm
  const llm = input.llm;
  if (!isRecord(llm)) {
    fail('llm', 'Is required');
  } else {
    if (!isOneOf(LLM_PROVIDERS, llm.provider)) fail('llm.provider', 'Unknown provider');
    text('llm.model', llm.model, { min: 1, max: 120 });
    num('llm.temperature', llm.temperature, 0, 1);
    num('llm.maxOutputTokens', llm.maxOutputTokens, 256, 64000);
    if (!isOneOf(LLM_EFFORTS, llm.effort)) fail('llm.effort', 'Must be low, medium, or high');
  }

  // trigger
  const trigger = input.trigger;
  if (!isRecord(trigger)) {
    fail('trigger', 'Is required');
  } else {
    if (!isOneOf(TRIGGER_TYPES, trigger.type)) fail('trigger.type', 'Invalid trigger type');
    if (trigger.schedule !== undefined) {
      const schedule = trigger.schedule;
      if (!isRecord(schedule)) {
        fail('trigger.schedule', 'Must be an object');
      } else {
        if (!isOneOf(SCHEDULE_FREQUENCIES, schedule.frequency)) {
          fail('trigger.schedule.frequency', 'Invalid frequency');
        }
        if (schedule.time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(schedule.time))) {
          fail('trigger.schedule.time', 'Use HH:MM (24h)');
        }
        if (schedule.dayOfWeek !== undefined) num('trigger.schedule.dayOfWeek', schedule.dayOfWeek, 0, 6);
        if (schedule.dayOfMonth !== undefined) num('trigger.schedule.dayOfMonth', schedule.dayOfMonth, 1, 28);
        if (schedule.cron !== undefined) {
          if (typeof schedule.cron !== 'string' || !/^[\d*/,\- ]{9,64}$/.test(schedule.cron)) {
            fail('trigger.schedule.cron', 'Use a 5-field cron expression');
          }
        }
      }
    }
    if (trigger.type === 'SCHEDULED' && !isRecord(trigger.schedule)) {
      fail('trigger.schedule', 'A scheduled trigger needs a schedule');
    }
  }

  // variables
  const variableNames = new Set<string>();
  if (!Array.isArray(input.variables)) {
    fail('variables', 'Must be an array');
  } else {
    if (input.variables.length > 30) fail('variables', 'At most 30 variables');
    input.variables.forEach((variable, index) => {
      const path = `variables[${index}]`;
      if (!isRecord(variable)) return fail(path, 'Must be an object');
      if (typeof variable.name !== 'string' || !IDENTIFIER_PATTERN.test(variable.name)) {
        fail(`${path}.name`, 'Use snake_case starting with a letter');
      } else if (variableNames.has(variable.name)) {
        fail(`${path}.name`, 'Duplicate variable name');
      } else {
        variableNames.add(variable.name);
      }
      if (!isOneOf(VARIABLE_TYPES, variable.type)) fail(`${path}.type`, 'Invalid type');
      if (typeof variable.required !== 'boolean') fail(`${path}.required`, 'Must be true or false');
      if (variable.description !== undefined) text(`${path}.description`, variable.description, { max: 500 });
      const dv = variable.defaultValue;
      if (dv !== undefined && dv !== null && !['string', 'number', 'boolean'].includes(typeof dv)) {
        fail(`${path}.defaultValue`, 'Must be a string, number, or boolean');
      }
    });
  }

  // dataInputs
  if (!Array.isArray(input.dataInputs)) {
    fail('dataInputs', 'Must be an array');
  } else {
    if (input.dataInputs.length > 5) fail('dataInputs', 'At most 5 data inputs');
    input.dataInputs.forEach((dataInput, index) => {
      const path = `dataInputs[${index}]`;
      if (!isRecord(dataInput)) return fail(path, 'Must be an object');
      text(`${path}.connectionId`, dataInput.connectionId, { min: 1, max: 64 });
      if (!Array.isArray(dataInput.resources) || dataInput.resources.length === 0) {
        fail(`${path}.resources`, 'Select at least one authorized resource');
      } else {
        dataInput.resources.forEach((resource, rIndex) => {
          if (typeof resource !== 'string' || !COLLECTION_PATTERN.test(resource)) {
            fail(`${path}.resources[${rIndex}]`, 'Invalid resource collection');
          }
        });
      }
      if (
        !Array.isArray(dataInput.operations) ||
        dataInput.operations.length === 0 ||
        !dataInput.operations.every((op) => isOneOf(DATA_OPERATIONS, op))
      ) {
        fail(`${path}.operations`, 'Choose list and/or read');
      }
      if (!Array.isArray(dataInput.bindings)) {
        fail(`${path}.bindings`, 'Must be an array');
      } else {
        dataInput.bindings.forEach((binding, bIndex) => {
          const bPath = `${path}.bindings[${bIndex}]`;
          if (!isRecord(binding)) return fail(bPath, 'Must be an object');
          if (typeof binding.variable !== 'string' || !variableNames.has(binding.variable)) {
            fail(`${bPath}.variable`, 'Must reference a declared variable');
          }
          if (
            typeof binding.collection !== 'string' ||
            !Array.isArray(dataInput.resources) ||
            !dataInput.resources.includes(binding.collection)
          ) {
            fail(`${bPath}.collection`, 'Must be one of the selected resources');
          }
        });
      }
    });
  }

  // compute
  const compute = input.compute;
  if (!isRecord(compute)) {
    fail('compute', 'Is required');
  } else {
    text('compute.systemInstructions', compute.systemInstructions, { min: 1 });
    text('compute.taskInstructions', compute.taskInstructions, { min: 1 });
    if (!isRecord(compute.inputMapping)) {
      fail('compute.inputMapping', 'Must be an object');
    } else {
      Object.entries(compute.inputMapping).forEach(([key, value]) => {
        if (!variableNames.has(key)) fail(`compute.inputMapping.${key}`, 'Unknown variable');
        text(`compute.inputMapping.${key}`, value, { min: 1, max: 120 });
      });
    }
    validateOutputSchema(compute.outputSchema, 'compute.outputSchema', 0, fail);
    if (isRecord(compute.outputSchema) && compute.outputSchema.type !== 'object') {
      fail('compute.outputSchema.type', 'The root output must be an object');
    }
    if (
      !Array.isArray(compute.validators) ||
      !compute.validators.every((v) => isOneOf(DETERMINISTIC_VALIDATORS, v))
    ) {
      fail('compute.validators', 'Unknown deterministic validator');
    }
  }

  // actions
  const actionIds = new Set<string>();
  if (!Array.isArray(input.actions)) {
    fail('actions', 'Must be an array');
  } else {
    input.actions.forEach((action, index) => {
      const path = `actions[${index}]`;
      if (!isRecord(action)) return fail(path, 'Must be an object');
      if (typeof action.id !== 'string' || !ACTION_ID_PATTERN.test(action.id)) {
        fail(`${path}.id`, 'Lowercase id required');
      } else if (actionIds.has(action.id)) {
        fail(`${path}.id`, 'Duplicate action id');
      } else {
        actionIds.add(action.id);
      }
      if (!isOneOf(ACTION_TYPES, action.type)) fail(`${path}.type`, 'Unknown action type');
      text(`${path}.label`, action.label, { min: 1, max: 120 });
      if (!isOneOf(ACTION_RUN_WHEN, action.runWhen)) fail(`${path}.runWhen`, 'ALWAYS or ON_CONDITION');
      if (action.config !== undefined && !isRecord(action.config)) fail(`${path}.config`, 'Must be an object');
      if (isRecord(action.config) && action.config.recipients !== undefined) {
        const recipients = action.config.recipients;
        if (!Array.isArray(recipients) || recipients.length > MAX_EMAIL_RECIPIENTS) {
          fail(`${path}.config.recipients`, `Up to ${MAX_EMAIL_RECIPIENTS} email addresses`);
        } else {
          recipients.forEach((r, i) => {
            if (typeof r !== 'string' || !isValidEmail(r)) fail(`${path}.config.recipients[${i}]`, 'Invalid email address');
          });
        }
      }
    });
  }

  // conditions
  if (!Array.isArray(input.conditions)) {
    fail('conditions', 'Must be an array');
  } else {
    input.conditions.forEach((condition, index) => {
      const path = `conditions[${index}]`;
      if (!isRecord(condition)) return fail(path, 'Must be an object');
      text(`${path}.id`, condition.id, { min: 1, max: 64 });
      text(`${path}.name`, condition.name, { min: 1, max: 120 });
      if (typeof condition.field !== 'string' || !/^[a-z][a-z0-9_.]{0,127}$/.test(condition.field)) {
        fail(`${path}.field`, 'Reference an output field, e.g. discrepancy_amount');
      }
      if (!isOneOf(CONDITION_OPERATORS, condition.operator)) fail(`${path}.operator`, 'Unknown operator');
      if (condition.valueFromVariable !== undefined) {
        if (typeof condition.valueFromVariable !== 'string' || !variableNames.has(condition.valueFromVariable)) {
          fail(`${path}.valueFromVariable`, 'Must reference a declared variable');
        }
      } else if (
        condition.value === undefined ||
        !['string', 'number', 'boolean'].includes(typeof condition.value)
      ) {
        fail(`${path}.value`, 'Provide a comparison value or a variable');
      }
      (['thenActions', 'elseActions'] as const).forEach((branch) => {
        const ids = condition[branch];
        if (!Array.isArray(ids)) return fail(`${path}.${branch}`, 'Must be an array');
        ids.forEach((id, i) => {
          if (typeof id !== 'string' || !actionIds.has(id)) {
            fail(`${path}.${branch}[${i}]`, 'Must reference a declared action');
          }
        });
      });
    });
  }

  // resourceLimits
  const limits = input.resourceLimits;
  if (!isRecord(limits)) {
    fail('resourceLimits', 'Is required');
  } else {
    num('resourceLimits.maxConcurrency', limits.maxConcurrency, 1, 50);
    num('resourceLimits.timeoutSeconds', limits.timeoutSeconds, 10, 900);
    num('resourceLimits.maxDataResources', limits.maxDataResources, 1, 50);
    num('resourceLimits.spendCapUsd', limits.spendCapUsd, 0, 100000);
    num('resourceLimits.spendWindowDays', limits.spendWindowDays, 1, 365);
    if (!isOneOf(PRIORITY_TIERS, limits.priorityTier)) fail('resourceLimits.priorityTier', 'Invalid tier');
  }

  return { isValid: errors.length === 0, errors };
};

const validateOutputSchema = (
  node: unknown,
  path: string,
  depth: number,
  fail: (path: string, message: string) => void,
): void => {
  if (depth > MAX_SCHEMA_DEPTH) return fail(path, 'Output schema is nested too deeply');
  if (!isRecord(node)) return fail(path, 'Must be a schema object');
  const allowedKeys = new Set(['type', 'description', 'properties', 'required', 'items', 'enum']);
  Object.keys(node).forEach((key) => {
    if (!allowedKeys.has(key)) fail(`${path}.${key}`, 'Unsupported schema keyword');
  });
  const validTypes: JsonSchemaType[] = ['object', 'array', 'string', 'number', 'integer', 'boolean'];
  if (!validTypes.includes(node.type as JsonSchemaType)) return fail(`${path}.type`, 'Invalid type');
  if (node.type === 'object') {
    if (!isRecord(node.properties) || Object.keys(node.properties).length === 0) {
      return fail(`${path}.properties`, 'An object needs at least one property');
    }
    Object.entries(node.properties).forEach(([key, child]) => {
      if (!IDENTIFIER_PATTERN.test(key)) fail(`${path}.properties.${key}`, 'Use snake_case field names');
      validateOutputSchema(child, `${path}.properties.${key}`, depth + 1, fail);
    });
    if (node.required !== undefined) {
      if (!Array.isArray(node.required) || !node.required.every((r) => typeof r === 'string')) {
        fail(`${path}.required`, 'Must be a list of field names');
      }
    }
  }
  if (node.type === 'array') validateOutputSchema(node.items, `${path}.items`, depth + 1, fail);
  if (node.enum !== undefined && (!Array.isArray(node.enum) || !node.enum.every((e) => typeof e === 'string'))) {
    fail(`${path}.enum`, 'Must be a list of strings');
  }
};

/** Coerce a raw variable value to its declared type, or explain why it cannot be. */
export const coerceVariableValue = (
  variable: AgentVariable,
  raw: unknown,
): { ok: true; value: string | number | boolean | null | unknown } | { ok: false; message: string } => {
  if (raw === undefined || raw === null || raw === '') {
    if (variable.defaultValue !== undefined && variable.defaultValue !== null && variable.defaultValue !== '') {
      return coerceVariableValue({ ...variable, defaultValue: undefined }, variable.defaultValue);
    }
    if (variable.required) return { ok: false, message: `${variable.name} is required` };
    return { ok: true, value: null };
  }
  switch (variable.type) {
    case 'string':
      return typeof raw === 'string' && raw.length <= 2000
        ? { ok: true, value: raw.trim() }
        : { ok: false, message: `${variable.name} must be text` };
    case 'number': {
      const value = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(value)
        ? { ok: true, value }
        : { ok: false, message: `${variable.name} must be a number` };
    }
    case 'boolean':
      if (typeof raw === 'boolean') return { ok: true, value: raw };
      if (raw === 'true' || raw === 'false') return { ok: true, value: raw === 'true' };
      return { ok: false, message: `${variable.name} must be true or false` };
    case 'date': {
      const date = new Date(String(raw));
      return Number.isNaN(date.getTime())
        ? { ok: false, message: `${variable.name} must be a date` }
        : { ok: true, value: date.toISOString().slice(0, 10) };
    }
    case 'json':
      if (typeof raw === 'string') {
        try {
          return { ok: true, value: JSON.parse(raw) };
        } catch {
          return { ok: false, message: `${variable.name} must be valid JSON` };
        }
      }
      return { ok: true, value: raw };
  }
};

/** Create a blank-but-valid starting definition for the "Create agent" flow. */
export const createBlankAgentDefinition = (connectionId = ''): AgentDefinition => ({
  schemaVersion: AGENT_DEFINITION_SCHEMA_VERSION,
  identity: {
    name: 'New Agent',
    description: '',
    agentKey: 'new-agent',
    department: 'Operations',
    status: 'DRAFT',
  },
  llm: {
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    temperature: 0,
    maxOutputTokens: 4000,
    effort: 'low',
  },
  trigger: { type: 'MANUAL' },
  variables: [
    {
      name: 'document_id',
      type: 'string',
      required: true,
      description: 'Document to analyze',
    },
  ],
  dataInputs: connectionId
    ? [
        {
          connectionId,
          resources: ['invoices'],
          operations: ['list', 'read'],
          bindings: [{ variable: 'document_id', collection: 'invoices', label: 'Document' }],
        },
      ]
    : [],
  compute: {
    systemInstructions:
      'You are an enterprise analysis agent. Work only from the documents provided. If a value is not present in a document, say so rather than guessing.',
    taskInstructions: 'Summarize the document and list any risks you notice.',
    inputMapping: { document_id: 'Document' },
    outputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Short summary of the document' },
        risk_count: { type: 'integer', description: 'Number of risks identified' },
        risks: { type: 'array', items: { type: 'string' }, description: 'Risks identified' },
      },
      required: ['summary', 'risk_count', 'risks'],
    },
    validators: [],
  },
  conditions: [
    {
      id: 'risk-check',
      name: 'Risks found',
      field: 'risk_count',
      operator: 'gt',
      value: 0,
      thenActions: ['notify'],
      elseActions: [],
    },
  ],
  actions: [
    { id: 'report', type: 'GENERATE_REPORT', label: 'Generate report', runWhen: 'ALWAYS' },
    { id: 'save', type: 'SAVE_RESULT', label: 'Save execution result', runWhen: 'ALWAYS' },
    {
      id: 'notify',
      type: 'CREATE_NOTIFICATION',
      label: 'Notify on risks',
      runWhen: 'ON_CONDITION',
      config: { title: 'Risks detected', severity: 'warning' },
    },
  ],
  resourceLimits: {
    maxConcurrency: 2,
    timeoutSeconds: 120,
    maxDataResources: 5,
    spendCapUsd: 10,
    spendWindowDays: 30,
    priorityTier: 'STANDARD',
  },
});

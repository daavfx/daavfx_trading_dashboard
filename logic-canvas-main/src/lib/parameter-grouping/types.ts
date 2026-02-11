// Types for Smart Parameter Grouping & Tagging System

export interface ParameterTag {
  id: string;
  name: string;
  color: string; // Color in hex format
  description: string;
  createdAt: number;
  createdBy: string;
}

export interface ParameterGroup {
  id: string;
  name: string;
  description: string;
  type: 'engine' | 'group' | 'logic' | 'function' | 'custom'; // Grouping criteria
  criteria: GroupCriteria; // Criteria for inclusion
  parameters: GroupedParameter[]; // Explicitly listed parameters
  tags: string[]; // Associated tag IDs
  createdAt: number;
  createdBy: string;
  isActive: boolean;
}

export interface GroupCriteria {
  // Engine-based grouping
  engineIds?: string[];
  // Group-based grouping
  groupNumbers?: number[];
  // Logic-based grouping
  logicNames?: string[];
  // Function-based grouping (by parameter category)
  categories?: string[];
  // Custom field matching
  fieldPatterns?: string[]; // Regex patterns for field names
  // Value-based grouping
  valueRanges?: {
    field: string;
    min?: number;
    max?: number;
  }[];
}

export interface GroupedParameter {
  engineId: string;
  groupId: number;
  logicName: string;
  fieldName: string;
  currentValue: any;
  tags: string[]; // Tag IDs associated with this specific parameter
}

export interface GroupingRule {
  id: string;
  name: string;
  description: string;
  criteria: GroupCriteria;
  autoApply: boolean; // Whether to automatically apply this grouping
  createdAt: number;
  createdBy: string;
}

export interface TaggingSystemState {
  tags: ParameterTag[];
  groups: ParameterGroup[];
  rules: GroupingRule[];
  parameterTags: Record<string, string[]>; // Maps parameter key to tag IDs
  parameterGroups: Record<string, string[]>; // Maps parameter key to group IDs
}
